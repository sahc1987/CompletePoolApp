import { prisma } from "./prisma";

// Weekly hours are derived from the jobs a worker actually performed rather than
// from a separate timesheet — the schedule already records duration, and a
// second source of truth would drift from it.
//
// "Worked" = the worker finished the job and sent it in (SUBMITTED) or it has
// been approved. SCHEDULED and IN_PROGRESS are still upcoming, and FLAGGED work
// is counted because the time was spent even if the result needs redoing.
const WORKED_STATUSES = ["SUBMITTED", "APPROVED", "FLAGGED"] as const;

export type WorkWeek = {
  /** Monday of the week, local time. */
  weekStart: Date;
  jobs: number;
  minutes: number;
  hours: number;
  /** hours x the rate passed in, or null when no rate is set. */
  pay: number | null;
};

/** Monday 00:00 local for the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Shift so Monday is the first day.
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x;
}

function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

/** Round to 2dp without floating-point crumbs. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Hours worked per week for one worker, most recent week first. Weeks with no
 * work are included as zeroes so a gap is visible rather than skipped.
 */
export async function weeklyHours(
  userId: string,
  opts?: { weeks?: number; hourlyRate?: number | null }
): Promise<WorkWeek[]> {
  const weeks = opts?.weeks ?? 8;
  const rate = opts?.hourlyRate ?? null;

  const thisWeek = startOfWeek(new Date());
  const from = addWeeks(thisWeek, -(weeks - 1));
  const to = addWeeks(thisWeek, 1);

  const tasks = await prisma.task.findMany({
    where: {
      workerId: userId,
      status: { in: [...WORKED_STATUSES] },
      startTime: { gte: from, lt: to },
    },
    select: { startTime: true, durationMin: true },
  });

  // Bucket by week start timestamp.
  const buckets = new Map<number, { jobs: number; minutes: number }>();
  for (let i = 0; i < weeks; i++) {
    buckets.set(addWeeks(from, i).getTime(), { jobs: 0, minutes: 0 });
  }
  for (const t of tasks) {
    const key = startOfWeek(t.startTime).getTime();
    const b = buckets.get(key);
    if (!b) continue; // outside the window we're reporting on
    b.jobs += 1;
    b.minutes += t.durationMin;
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0]) // newest week first
    .map(([ts, b]) => {
      const hours = money(b.minutes / 60);
      return {
        weekStart: new Date(ts),
        jobs: b.jobs,
        minutes: b.minutes,
        hours,
        pay: rate === null ? null : money(hours * rate),
      };
    });
}

/** "Mon Jul 27 – Sun Aug 2" style label for a week bucket. */
export function weekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(weekStart)} – ${f(end)}`;
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
