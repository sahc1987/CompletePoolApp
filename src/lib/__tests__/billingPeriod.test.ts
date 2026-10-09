/**
 * @jest-environment node
 */
import { inBillPeriod, resolveBillPeriod, scopeBill } from "../billingPeriod";

const TZ = "America/New_York";
// Wed Oct 8 2026, 10:00 in New York.
const NOW = new Date("2026-10-08T14:00:00Z");

describe("resolveBillPeriod", () => {
  it("is unscoped for all time or an unknown range", () => {
    expect(resolveBillPeriod({}, TZ, NOW)).toMatchObject({ range: "all", ranged: false, label: null });
    expect(resolveBillPeriod({ range: "decade" }, TZ, NOW).range).toBe("all");
  });

  it("starts the week on the business's Monday", () => {
    const p = resolveBillPeriod({ range: "week" }, TZ, NOW);
    // Monday Oct 5, 00:00 in New York (EDT, UTC-4).
    expect(p.start?.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(p.end?.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(p.label).toBe("Oct 5, 2026 – Oct 11, 2026");
  });

  it("covers the whole calendar month", () => {
    const p = resolveBillPeriod({ range: "month" }, TZ, NOW);
    expect(p.start?.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    // November 1 is still EDT; the clocks change on the 1st at 2am.
    expect(p.end?.toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("gives a day with its neighbours, defaulting to today", () => {
    const today = resolveBillPeriod({ range: "day" }, TZ, NOW);
    expect(today).toMatchObject({ dayValue: "2026-10-08", prevDay: "2026-10-07", nextDay: "2026-10-09" });
    const picked = resolveBillPeriod({ range: "day", from: "2026-09-30" }, TZ, NOW);
    expect(picked).toMatchObject({ dayValue: "2026-09-30", nextDay: "2026-10-01", label: "on Sep 30, 2026" });
  });

  it("includes the 'to' day of a custom range, and reads a reversed one the right way round", () => {
    const p = resolveBillPeriod({ range: "custom", from: "2026-10-10", to: "2026-10-01" }, TZ, NOW);
    expect(p.start?.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(p.end?.toISOString()).toBe("2026-10-11T04:00:00.000Z");
    expect(inBillPeriod(p, "2026-10-11T03:59:00Z")).toBe(true); // 11:59pm on the 10th
    expect(inBillPeriod(p, "2026-10-11T04:00:00Z")).toBe(false);
  });
});

describe("scopeBill", () => {
  const week = resolveBillPeriod({ range: "week" }, TZ, NOW);
  const bill = (date: string, paidAt: string[]) => ({
    task: { date },
    payments: paidAt.map((d) => ({ paidAt: d, amount: 50 })),
    reversals: [],
  });

  it("counts last week's job paid this week as collected but not billed", () => {
    const cut = scopeBill(bill("2026-09-28T04:00:00Z", ["2026-09-29T15:00:00Z", "2026-10-06T15:00:00Z"]), week);
    expect(cut).toMatchObject({
      touches: true,
      billedInPeriod: false,
      paidInPeriod: 50,
      keep: [false, true],
    });
  });

  it("leaves out a bill with nothing in the period", () => {
    expect(scopeBill(bill("2026-09-28T04:00:00Z", []), week).touches).toBe(false);
  });

  it("keeps everything when unscoped", () => {
    const all = resolveBillPeriod({}, TZ, NOW);
    expect(scopeBill(bill("2020-01-01T05:00:00Z", ["2020-01-02T15:00:00Z"]), all)).toMatchObject({
      touches: true,
      billedInPeriod: true,
      paidInPeriod: 50,
    });
  });
});
