import { prisma } from "./prisma";
import { BUSINESS_TZ, zonedWeekStart, addZonedDays } from "./timezone";

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

/** Monday 00:00 for the week containing `d`, in the business timezone. */
export function startOfWeek(d: Date, tz: string = BUSINESS_TZ): Date {
  return zonedWeekStart(d, tz);
}

function addWeeks(d: Date, n: number, tz: string): Date {
  return addZonedDays(d, n * 7, tz);
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
  opts?: { weeks?: number; hourlyRate?: number | null; timezone?: string }
): Promise<WorkWeek[]> {
  const weeks = opts?.weeks ?? 8;
  const rate = opts?.hourlyRate ?? null;
  const tz = opts?.timezone ?? BUSINESS_TZ;

  const thisWeek = startOfWeek(new Date(), tz);
  const from = addWeeks(thisWeek, -(weeks - 1), tz);
  const to = addWeeks(thisWeek, 1, tz);

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
    buckets.set(addWeeks(from, i, tz).getTime(), { jobs: 0, minutes: 0 });
  }
  for (const t of tasks) {
    const key = startOfWeek(t.startTime, tz).getTime();
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

/** "Jul 27 – Aug 2" style label for a week bucket. */
export function weekLabel(weekStart: Date, tz: string = BUSINESS_TZ): string {
  const end = addZonedDays(weekStart, 6, tz);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
  return `${f(weekStart)} – ${f(end)}`;
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
