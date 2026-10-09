import { paidAmount } from "./billing";
import {
  addZonedDays,
  parseZonedDate,
  zonedDayKey,
  zonedDayStart,
  zonedMonthStart,
  zonedWeekStart,
} from "./timezone";

/**
 * The billing date scope — "this week", "this month", one day, or a custom
 * range — shared by the web billing page and the API, so a phone and a
 * browser agree on what "this week" collected.
 *
 * Every boundary is built in the business's timezone: job dates are stored at
 * business-local midnight, and a boundary in any other zone would slide by the
 * offset between them.
 */

export const BILL_RANGES = ["all", "day", "week", "month", "custom"] as const;
export type BillRange = (typeof BILL_RANGES)[number];

export const BILL_RANGE_LABEL: Record<BillRange, string> = {
  all: "All time",
  day: "Specific date",
  week: "This week",
  month: "This month",
  custom: "Custom",
};

export type BillPeriod = {
  range: BillRange;
  /** Inclusive; null for "from the beginning". */
  start: Date | null;
  /** Exclusive; null for "up to now". */
  end: Date | null;
  /** False for "all time" — nothing is scoped. */
  ranged: boolean;
  /** "Oct 6, 2026 – Oct 12, 2026" or "on Oct 6, 2026"; null when not ranged. */
  label: string | null;
  /** Business-zone YYYY-MM-DD keys, for a day picker and its arrows. */
  todayValue: string;
  dayValue: string;
  prevDay: string;
  nextDay: string;
};

export const isBillRange = (v: unknown): v is BillRange =>
  typeof v === "string" && (BILL_RANGES as readonly string[]).includes(v);

const fmt = (d: Date, tz: string) =>
  d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });

/**
 * Resolve a range and its `from`/`to` ("YYYY-MM-DD", business zone) into
 * concrete bounds. For "day", `from` is the day (default today). A reversed
 * custom range is read the way it was obviously meant rather than matching
 * nothing.
 */
export function resolveBillPeriod(
  opts: { range?: string | null; from?: string | null; to?: string | null },
  tz: string,
  now: Date = new Date()
): BillPeriod {
  const range: BillRange = isBillRange(opts.range) ? opts.range : "all";
  const from = (opts.from ?? "").trim();
  const to = (opts.to ?? "").trim();

  let start: Date | null = null;
  let end: Date | null = null;
  if (range === "day") {
    start = (from ? parseZonedDate(from, tz) : null) ?? zonedDayStart(now, tz);
    end = addZonedDays(start, 1, tz);
  } else if (range === "week") {
    start = zonedWeekStart(now, tz);
    end = addZonedDays(start, 7, tz);
  } else if (range === "month") {
    start = zonedMonthStart(now, tz);
    // +32 days always lands in the next month, whatever its length.
    end = zonedMonthStart(addZonedDays(start, 32, tz), tz);
  } else if (range === "custom") {
    start = from ? parseZonedDate(from, tz) : null;
    const toDate = to ? parseZonedDate(to, tz) : null;
    // "To" is the last day you want included, not the cut-off before it.
    end = toDate ? addZonedDays(toDate, 1, tz) : null;
  }
  if (start && end && start >= end) {
    [start, end] = [addZonedDays(end, -1, tz), addZonedDays(start, 1, tz)];
  }
  const ranged = start !== null || end !== null;

  const todayValue = zonedDayKey(now, tz);
  const onDay = range === "day" && start;

  return {
    range,
    start,
    end,
    ranged,
    label: !ranged
      ? null
      : onDay
        ? `on ${fmt(start!, tz)}`
        : `${start ? fmt(start, tz) : "the beginning"} – ${end ? fmt(addZonedDays(end, -1, tz), tz) : "today"}`,
    todayValue,
    dayValue: onDay ? zonedDayKey(start!, tz) : todayValue,
    prevDay: onDay ? zonedDayKey(addZonedDays(start!, -1, tz), tz) : todayValue,
    nextDay: onDay ? zonedDayKey(addZonedDays(start!, 1, tz), tz) : todayValue,
  };
}

export function inBillPeriod(period: BillPeriod, value: Date | string | null | undefined) {
  if (!value) return false;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return false;
  if (period.start && d < period.start) return false;
  if (period.end && d >= period.end) return false;
  return true;
}

type ScopableBill = {
  task: { date: string };
  payments: { paidAt: string; amount: number }[];
  reversals: { createdAt: string }[];
};

export type ScopedBill = {
  /** The job was done in the period, or money came in during it. */
  touches: boolean;
  /** Per payment, in order: did it land in the period. */
  keep: boolean[];
  /** What came in during the period. */
  paidInPeriod: number;
  /** Only a job dated inside the period counts as billed in it. */
  billedInPeriod: boolean;
  /** Indices into `reversals` made during the period. */
  reversalsInPeriod: boolean[];
};

/**
 * How one bill sits in a period. A bill belongs to it if the job was done in
 * it *or* money came in during it — last month's job paid this month shows up
 * in the month you collected it. The balance is never re-cut: it's what's
 * owed today, whatever the period.
 */
export function scopeBill(bill: ScopableBill, period: BillPeriod): ScopedBill {
  if (!period.ranged) {
    return {
      touches: true,
      keep: bill.payments.map(() => true),
      paidInPeriod: paidAmount(bill.payments),
      billedInPeriod: true,
      reversalsInPeriod: bill.reversals.map(() => true),
    };
  }
  const keep = bill.payments.map((p) => inBillPeriod(period, p.paidAt));
  const billedInPeriod = inBillPeriod(period, bill.task.date);
  return {
    touches: billedInPeriod || keep.some(Boolean),
    keep,
    paidInPeriod: paidAmount(bill.payments.filter((_, i) => keep[i])),
    billedInPeriod,
    reversalsInPeriod: bill.reversals.map((r) => inBillPeriod(period, r.createdAt)),
  };
}
