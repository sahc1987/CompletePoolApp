// The business runs on one clock. Every "9:00 AM" in this app means 9:00 AM in
// that zone, no matter where the server or the viewer happens to be — Vercel
// runs in UTC, which otherwise shifted every job time by the UTC offset.
//
// Overridable so the same code serves a company in another zone.
export const BUSINESS_TZ = process.env.BUSINESS_TZ || "America/New_York";

const pad = (n: number) => String(n).padStart(2, "0");

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATTERS.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant, as read in `tz`. */
export function zonedParts(date: Date, tz: string = BUSINESS_TZ): Parts {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // Intl can emit "24" for midnight in hour12:false.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** How far `tz` is from UTC at this instant, in ms (positive east). */
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Discard sub-second so the difference is a clean offset.
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which `tz`'s wall clock reads the given local time.
 *
 * Resolved in two passes: the offset depends on the instant, and the instant
 * depends on the offset. The second pass corrects the estimate across a DST
 * boundary, where the first guess can land on the wrong side.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  tz: string = BUSINESS_TZ
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = wall - offsetMs(new Date(wall), tz);
  ts = wall - offsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** Parse "YYYY-MM-DD" + "HH:MM" as business-local time. */
export function parseZonedDateTime(
  dateStr: string,
  timeStr: string,
  tz: string = BUSINESS_TZ
): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!d || !t) return null;
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (hour > 23 || minute > 59) return null;
  return zonedTimeToUtc(Number(d[1]), Number(d[2]), Number(d[3]), hour, minute, tz);
}

/** Parse "YYYY-MM-DD" as business-local midnight. */
export function parseZonedDate(
  dateStr: string,
  tz: string = BUSINESS_TZ
): Date | null {
  return parseZonedDateTime(dateStr, "00:00", tz);
}

/** Midnight (business-local) of the day containing `date`. */
export function zonedDayStart(date: Date, tz: string = BUSINESS_TZ): Date {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz);
}

/** Midnight `days` after the one containing `date`. */
export function addZonedDays(
  date: Date,
  days: number,
  tz: string = BUSINESS_TZ
): Date {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc(p.year, p.month, p.day + days, 0, 0, tz);
}

/** Minutes from business-local midnight — what business hours compare against. */
export function minutesIntoZonedDay(date: Date, tz: string = BUSINESS_TZ): number {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

/** "YYYY-MM-DD" for the business-local day containing `date`. */
export function zonedDayKey(date: Date, tz: string = BUSINESS_TZ): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 0 = Sunday … 6 = Saturday, in business-local terms. */
export function zonedDayOfWeek(date: Date, tz: string = BUSINESS_TZ): number {
  const p = zonedParts(date, tz);
  // Weekday of that calendar date, computed independently of any zone.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Monday (business-local) of the week containing `date`. */
export function zonedWeekStart(date: Date, tz: string = BUSINESS_TZ): Date {
  const shift = (zonedDayOfWeek(date, tz) + 6) % 7; // Monday-first
  return addZonedDays(date, -shift, tz);
}
