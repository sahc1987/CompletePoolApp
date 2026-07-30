import { prisma } from "./prisma";
import {
  BUSINESS_TZ,
  minutesIntoZonedDay,
  zonedDayStart,
  addZonedDays,
} from "./timezone";

/** Zones offered in Settings. Curated — the full IANA list is ~400 entries. */
export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern — New York" },
  { value: "America/Chicago", label: "Central — Chicago" },
  { value: "America/Denver", label: "Mountain — Denver" },
  { value: "America/Phoenix", label: "Mountain (no DST) — Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
  { value: "America/Toronto", label: "Eastern — Toronto" },
  { value: "America/Vancouver", label: "Pacific — Vancouver" },
] as const;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Business hours and double-booking rules live here so every entry point that
// creates or moves a job (assign form, calendar editor, drag-and-drop) enforces
// exactly the same thing.

export const DEFAULT_WORKDAY_START_MIN = 8 * 60; // 08:00
export const DEFAULT_WORKDAY_END_MIN = 19 * 60; // 19:00

export type WorkHours = {
  startMin: number;
  endMin: number;
  /** IANA zone the hours are expressed in. */
  timezone: string;
};

/** Minutes from local midnight -> "HH:MM" for time inputs and messages. */
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" -> minutes from midnight. Returns null when unparseable. */
export function hhmmToMin(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 12-hour label for user-facing messages, e.g. 1140 -> "7:00 PM". */
export function minToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Configured workday and timezone, falling back to the defaults when unset. */
export async function getWorkHours(): Promise<WorkHours> {
  const row = await prisma.appSettings.findUnique({ where: { id: "app" } });
  const tz = row?.timezone;
  return {
    startMin: row?.workdayStartMin ?? DEFAULT_WORKDAY_START_MIN,
    endMin: row?.workdayEndMin ?? DEFAULT_WORKDAY_END_MIN,
    // Guard against a stored value the runtime doesn't know — a bad zone would
    // otherwise throw from every Intl call downstream.
    timezone: tz && isValidTimezone(tz) ? tz : BUSINESS_TZ,
  };
}

/** Just the configured zone, for callers that don't need the hours. */
export async function getBusinessTimezone(): Promise<string> {
  return (await getWorkHours()).timezone;
}

/**
 * Reject a job that starts before opening, ends after closing, or spills past
 * midnight. Returns an error message, or null when the slot is fine.
 */
export function checkWorkHours(
  startTime: Date,
  durationMin: number,
  hours: WorkHours
): string | null {
  // Business-local wall clock, so this is right on a UTC host too.
  const startMin = minutesIntoZonedDay(startTime, hours.timezone);
  const endMin = startMin + durationMin;

  if (startMin < hours.startMin) {
    return `Jobs can't start before ${minToLabel(hours.startMin)}. Change business hours in Settings if that's wrong.`;
  }
  if (endMin > hours.endMin) {
    return `This job would finish at ${minToLabel(
      endMin % (24 * 60)
    )}, past the ${minToLabel(hours.endMin)} cutoff. Shorten it, start earlier, or change business hours in Settings.`;
  }
  return null;
}

export type Conflict = {
  clientName: string;
  startLabel: string;
  endLabel: string;
};

/**
 * Find an existing job for the same worker whose time overlaps the proposed
 * slot. Cancelled jobs don't count, and `excludeTaskId` skips the job being
 * edited so it never conflicts with itself.
 *
 * End times are computed in JS because `startTime + durationMin` isn't a stored
 * column, so it can't be compared in the query.
 */
export async function findWorkerConflict(opts: {
  workerId: string;
  startTime: Date;
  durationMin: number;
  excludeTaskId?: string;
  timezone?: string;
}): Promise<Conflict | null> {
  const { workerId, startTime, durationMin, excludeTaskId } = opts;
  const tz = opts.timezone ?? BUSINESS_TZ;

  const newStart = startTime.getTime();
  const newEnd = newStart + durationMin * 60_000;

  // Business hours keep a job inside one day, but widen the fetch by a day on
  // each side so a long job seeded outside those bounds is still caught.
  const from = addZonedDays(zonedDayStart(startTime, tz), -1, tz);
  const to = addZonedDays(from, 3, tz);

  const candidates = await prisma.task.findMany({
    where: {
      workerId,
      status: { not: "CANCELLED" },
      startTime: { gte: from, lt: to },
      ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
    },
    select: {
      startTime: true,
      durationMin: true,
      client: { select: { name: true } },
    },
  });

  for (const c of candidates) {
    const s = c.startTime.getTime();
    const e = s + c.durationMin * 60_000;
    // Half-open intervals: a job ending exactly when the next starts is fine.
    if (s < newEnd && e > newStart) {
      return {
        clientName: c.client.name,
        startLabel: minToLabel(minutesIntoZonedDay(c.startTime, tz)),
        endLabel: minToLabel(minutesIntoZonedDay(new Date(e), tz)),
      };
    }
  }
  return null;
}

/** Message shown when a worker is already booked. */
export function conflictMessage(c: Conflict, workerName?: string): string {
  const who = workerName ? workerName : "That worker";
  return `${who} already has ${c.clientName}'s job from ${c.startLabel} to ${c.endLabel}. Pick another time or worker.`;
}
