"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import { directionsForDay, directionsTo, MAX_ROUTE_STOPS } from "@/lib/directions";
import type { DayRoute } from "@/server/services/routeReads";
import { loadDayRoute } from "./actions";

// Leaflet needs `window`, so the map renders in the browser only.
const DayMapCanvas = dynamic(() => import("./DayMapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-chrome-100" />,
});

type Role = "OWNER" | "ADMIN" | "WORKER";

// One color per worker, distinct from each other and readable under white
// numbers. Assigned in order of each worker's first stop.
const WORKER_COLORS = [
  "#1a56db", // blue
  "#0e7490", // teal
  "#b45309", // amber
  "#7e22ce", // purple
  "#be123c", // rose
  "#15803d", // green
  "#c2410c", // orange
  "#334155", // slate
];

/**
 * The calendar's Map tab: one day's stops on a map and in a list.
 * A worker sees their own route; managers see every worker's, colored per
 * worker, with a filter to focus on one.
 */
export default function DayMap({
  initialDay,
  role,
  onOpenJob,
  refreshToken,
}: {
  /** `YYYY-MM-DD`, business-local. */
  initialDay: string;
  role: Role;
  /** Admins only — opens the calendar's edit window. */
  onOpenJob?: (taskId: string) => void;
  /**
   * Changes whenever the calendar's data is refreshed (e.g. a job was edited
   * from this map), so the map reloads the day it's showing.
   */
  refreshToken?: unknown;
}) {
  const toast = useToast();
  const [day, setDay] = useState(initialDay);
  const [route, setRoute] = useState<DayRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [workerFilter, setWorkerFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isWorker = role === "WORKER";
  // The day on screen, for reloads that shouldn't jump back to the first day.
  const dayRef = useRef(initialDay);

  const load = useCallback(
    async (key: string) => {
      setLoading(true);
      const res = await loadDayRoute(key);
      if (res.error || !res.data) {
        toast(res.error ?? "Couldn't load the map.", "error");
      } else {
        setRoute(res.data);
        setDay(res.data.day);
        dayRef.current = res.data.day;
      }
      setLoading(false);
    },
    [toast]
  );

  // First load, and again whenever the calendar's data is refreshed.
  useEffect(() => {
    void load(dayRef.current);
  }, [refreshToken, load]);

  const colorFor = useMemo(() => {
    const index = new Map((route?.workers ?? []).map((w, i) => [w.id, i]));
    return (workerId: string) => WORKER_COLORS[(index.get(workerId) ?? 0) % WORKER_COLORS.length];
  }, [route]);

  const stops = (route?.stops ?? []).filter((s) => !workerFilter || s.workerId === workerFilter);
  const mapped = stops.filter((s) => s.lat !== null && s.lng !== null);
  const unmapped = stops.length - mapped.length;

  // A whole-day route only makes sense for one person's stops.
  const routeStops = isWorker || workerFilter ? stops : [];
  const dayDirections = directionsForDay(routeStops);

  const navBtn =
    "rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-chrome-100 disabled:opacity-50";

  return (
    <div className="space-y-3">
      {/* Day navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button className={navBtn} disabled={loading || !route} onClick={() => route && load(route.prevDay)} aria-label="Previous day">
            ‹
          </button>
          <button className={navBtn} disabled={loading || !route || day === route?.today} onClick={() => route && load(route.today)}>
            Today
          </button>
          <button className={navBtn} disabled={loading || !route} onClick={() => route && load(route.nextDay)} aria-label="Next day">
            ›
          </button>
        </div>
        <div className="text-lg font-bold text-ink">{route?.dayLabel ?? "…"}</div>
      </div>

      {/* Worker filter — managers only, and only when there's a choice to make */}
      {!isWorker && route && route.workers.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setWorkerFilter(null)}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
              workerFilter === null ? "bg-navy-700 text-white" : "bg-white text-ink ring-1 ring-line hover:bg-chrome-100"
            }`}
          >
            All workers
          </button>
          {route.workers.map((w) => (
            <button
              key={w.id}
              onClick={() => setWorkerFilter(w.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold transition ${
                workerFilter === w.id ? "bg-navy-700 text-white" : "bg-white text-ink ring-1 ring-line hover:bg-chrome-100"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(w.id) }} />
              {w.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        {/* isolate: Leaflet's panes use z-indexes up to 1000, which would
            otherwise draw over the job edit window opened from this map. */}
        <div className="relative isolate h-[420px] overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card sm:h-[560px]">
          {route && (
            <DayMapCanvas
              stops={mapped}
              colorFor={colorFor}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenJob={onOpenJob}
            />
          )}
          {!loading && route && stops.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
              <div className="rounded-2xl bg-white/95 px-5 py-3 text-sm font-medium text-muted shadow">
                No jobs scheduled this day.
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute right-3 top-3 z-[500] rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-muted shadow">
              Loading…
            </div>
          )}
        </div>

        {/* Stop list, in visit order */}
        <div className="rounded-2xl border border-line/80 bg-white p-3 shadow-card lg:max-h-[560px] lg:overflow-y-auto">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-bold text-ink">
              {stops.length} stop{stops.length === 1 ? "" : "s"}
            </span>
            {dayDirections && (
              <a
                href={dayDirections}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                {isWorker ? "Directions for my day" : "Directions for this route"}
              </a>
            )}
          </div>
          {routeStops.length > MAX_ROUTE_STOPS && dayDirections && (
            <p className="mb-2 px-1 text-xs text-faint">
              Directions cover the first {MAX_ROUTE_STOPS} stops.
            </p>
          )}
          {unmapped > 0 && (
            <p className="mb-2 rounded-lg bg-pending/10 px-2.5 py-1.5 text-xs text-pending">
              {unmapped} address{unmapped === 1 ? "" : "es"} couldn&apos;t be placed on the map —
              check {unmapped === 1 ? "it" : "them"} on the client page.
            </p>
          )}

          <ol className="space-y-1.5">
            {stops.map((s) => (
              <li key={s.taskId}>
                <div
                  className={`flex gap-3 rounded-xl px-2 py-2 transition ${
                    selectedId === s.taskId ? "bg-chrome-100" : "hover:bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.taskId)}
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: colorFor(s.workerId) }}
                    aria-label={`Stop ${s.order}`}
                  >
                    {s.order}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{s.clientName}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="text-xs text-muted">
                      {s.timeLabel} · {s.serviceName}
                      {!isWorker && ` · ${s.workerName}`}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {s.address}
                      {s.lat === null && " · location not found"}
                    </div>
                    <div className="mt-1 flex gap-3 text-xs font-semibold">
                      <a
                        href={directionsTo(s)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-700 hover:underline"
                      >
                        Navigate
                      </a>
                      {onOpenJob && (
                        <button type="button" onClick={() => onOpenJob(s.taskId)} className="text-navy-700 hover:underline">
                          Open job
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
