/**
 * A calendar date — "2026-10-08" — moved in and out of the native picker.
 *
 * This isn't date arithmetic: the server still decides what "today" or "this
 * week" means for the business. The picker hands back a Date at the phone's
 * local midnight, and the date the person tapped is that Date's *local*
 * year/month/day. Reading it as UTC (toISOString) would give the day before
 * anywhere east of Greenwich.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function toCalendarDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The picker's starting point for a "YYYY-MM-DD"; null when blank or malformed. */
export function fromCalendarDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // new Date(2026, 1, 31) quietly becomes March 3rd; that isn't the date asked for.
  return toCalendarDate(d) === m[0] ? d : null;
}

/** "Oct 8, 2026" for a "YYYY-MM-DD", without going through any timezone. */
export function calendarDateLabel(value: string): string {
  const d = fromCalendarDate(value);
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : value;
}
