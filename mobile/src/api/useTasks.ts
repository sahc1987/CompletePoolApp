import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./client";
import { tasks as tasksApi, type BusinessDay, type WorkerTask } from "./endpoints";

/**
 * The worker's job list, plus the business's idea of what day it is.
 *
 * Deliberately not a data-fetching library. There is one list, refreshed by
 * pull-to-refresh and after a mutation; a cache layer would be more machinery
 * than the whole screen.
 */

export type TaskGroup = {
  key: string;
  label: string;
  tasks: WorkerTask[];
};

export type TasksState = {
  groups: TaskGroup[];
  businessDay: BusinessDay | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  retryable: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Group a worker's jobs the way their day actually runs: rework first, then
 * today, tomorrow, and each later day under its own heading.
 *
 * Every comparison is string equality on `dayKey`, which the server computed in
 * the business's timezone. No date arithmetic happens here on purpose — the
 * phone's clock is not the business's, and a worker who crosses a timezone (or
 * a server running UTC) would otherwise see their day shift.
 */
export function groupTasks(
  list: WorkerTask[],
  businessDay: BusinessDay | null
): TaskGroup[] {
  const flagged = list.filter((t) => t.status === "FLAGGED");
  const rest = list.filter((t) => t.status !== "FLAGGED");

  const today = rest.filter((t) => t.dayKey === businessDay?.today);
  const tomorrow = rest.filter((t) => t.dayKey === businessDay?.tomorrow);
  const later = rest.filter(
    (t) => t.dayKey !== businessDay?.today && t.dayKey !== businessDay?.tomorrow
  );

  // Each later day keeps its own heading. A single "Later" bucket would strand
  // identical recurring jobs with no way to tell one from the next.
  const byDay = new Map<string, WorkerTask[]>();
  for (const t of later) {
    byDay.set(t.dayKey, [...(byDay.get(t.dayKey) ?? []), t]);
  }

  const groups: TaskGroup[] = [
    { key: "rework", label: "Needs rework", tasks: flagged },
    { key: "today", label: "Today", tasks: today },
    { key: "tomorrow", label: "Tomorrow", tasks: tomorrow },
    ...[...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayKey, dayTasks]) => ({
        key: dayKey,
        label: labelForDay(dayKey),
        tasks: dayTasks,
      })),
  ];

  return groups.filter((g) => g.tasks.length > 0);
}

/**
 * "2026-09-20" -> "Sunday, Sep 20".
 *
 * Built from the date parts directly rather than `new Date(dayKey)`, which
 * parses a bare date as UTC midnight and prints the previous day anywhere west
 * of Greenwich — the exact off-by-one this whole approach exists to avoid.
 */
export function labelForDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function useTasks(): TasksState {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [businessDay, setBusinessDay] = useState<BusinessDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);

    try {
      const res = await tasksApi.mine();
      setBusinessDay(res.businessDay);
      setGroups(groupTasks(res.tasks, res.businessDay));
      setError(null);
      setRetryable(false);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError("INTERNAL", "Couldn't load your jobs.");
      setError(err.message);
      setRetryable(err.retryable);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  return {
    groups,
    businessDay,
    loading,
    refreshing,
    error,
    retryable,
    reload: () => load("initial"),
    refresh: () => load("refresh"),
  };
}
