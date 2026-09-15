import { groupTasks, labelForDay } from "../useTasks";
import type { BusinessDay, WorkerTask } from "../endpoints";

/**
 * The grouping a worker's whole day hangs off.
 *
 * Every assertion here is about one rule: the device does no date arithmetic.
 * It compares the server's `dayKey` to the server's `today`/`tomorrow` as
 * strings, because the phone's clock is not the business's — and a worker who
 * drives across a timezone, or a phone left on airplane mode, must not see
 * their jobs move.
 */

const businessDay: BusinessDay = {
  timezone: "America/New_York",
  today: "2026-09-14",
  tomorrow: "2026-09-15",
};

let seq = 0;
const task = (over: Partial<WorkerTask> = {}): WorkerTask => ({
  id: `t${++seq}`,
  status: "SCHEDULED",
  startTime: "2026-09-14T14:00:00.000Z",
  dayKey: "2026-09-14",
  durationMin: 60,
  price: 100,
  notes: null,
  flagReason: null,
  submittedAt: null,
  clientName: "Casa Verde",
  clientPhone: null,
  poolAddress: "1 Pool Ln",
  serviceName: "Weekly clean",
  ...over,
});

describe("groupTasks", () => {
  it("puts rework first, ahead of today", () => {
    const groups = groupTasks(
      [
        task({ dayKey: "2026-09-14" }),
        task({ status: "FLAGGED", dayKey: "2026-09-14", flagReason: "Missed the skimmer" }),
      ],
      businessDay
    );
    expect(groups.map((g) => g.key)).toEqual(["rework", "today"]);
  });

  /** A flagged job belongs under "Needs rework" whatever day it was scheduled. */
  it("groups a flagged job by status, not by its day", () => {
    const groups = groupTasks(
      [task({ status: "FLAGGED", dayKey: "2026-09-20" })],
      businessDay
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("rework");
  });

  it("separates today, tomorrow and each later day", () => {
    const groups = groupTasks(
      [
        task({ dayKey: "2026-09-14" }),
        task({ dayKey: "2026-09-15" }),
        task({ dayKey: "2026-09-17" }),
        task({ dayKey: "2026-09-16" }),
      ],
      businessDay
    );
    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "tomorrow",
      "2026-09-16",
      "2026-09-17",
    ]);
  });

  it("drops empty groups rather than showing a bare heading", () => {
    const groups = groupTasks([task({ dayKey: "2026-09-15" })], businessDay);
    expect(groups.map((g) => g.key)).toEqual(["tomorrow"]);
  });

  /**
   * The case the server's dayKey exists for: a 9:30pm Eastern job is already
   * tomorrow in UTC. It must still sit under "Today".
   */
  it("keeps a late-evening job on today, where UTC would not", () => {
    const evening = task({
      dayKey: "2026-09-14",
      startTime: "2026-09-15T01:30:00.000Z",
    });
    const groups = groupTasks([evening], businessDay);
    expect(groups[0].key).toBe("today");
    // Proof the ISO date and the business day genuinely disagree here.
    expect(evening.startTime.slice(0, 10)).toBe("2026-09-15");
  });

  it("returns nothing for an empty list", () => {
    expect(groupTasks([], businessDay)).toEqual([]);
  });

  /** Before the first response lands there is no business day to compare to. */
  it("files everything under later when the business day is unknown", () => {
    const groups = groupTasks([task({ dayKey: "2026-09-14" })], null);
    expect(groups.map((g) => g.key)).toEqual(["2026-09-14"]);
  });
});

describe("labelForDay", () => {
  /**
   * `new Date("2026-09-20")` parses as UTC midnight, which prints as the 19th
   * anywhere west of Greenwich — the exact off-by-one the dayKey approach
   * exists to avoid, reintroduced at the last step.
   */
  it("names the day the key says, not the one local midnight suggests", () => {
    expect(labelForDay("2026-09-20")).toBe("Sunday, Sep 20");
    expect(labelForDay("2026-01-01")).toBe("Thursday, Jan 1");
  });

  it("passes a malformed key through rather than printing Invalid Date", () => {
    expect(labelForDay("not-a-day")).toBe("not-a-day");
  });
});
