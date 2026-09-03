/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

// jest.mock is hoisted above the imports, so the mock is built inside the
// factory and read back afterwards rather than closed over.
jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;

import {
  minToHHMM,
  hhmmToMin,
  minToLabel,
  isValidTimezone,
  checkWorkHours,
  conflictMessage,
  getWorkHours,
  getBusinessTimezone,
  findWorkerConflict,
  DEFAULT_WORKDAY_START_MIN,
  DEFAULT_WORKDAY_END_MIN,
  TIMEZONE_OPTIONS,
  type WorkHours,
} from "../schedule";
import { parseZonedDateTime } from "../timezone";

const NY = "America/New_York";
const HOURS: WorkHours = { startMin: 8 * 60, endMin: 19 * 60, timezone: NY };

/** A business-local wall time, as the app would store it. */
const at = (date: string, time: string) => parseZonedDateTime(date, time, NY)!;

describe("minToHHMM", () => {
  it.each([
    [0, "00:00"],
    [8 * 60, "08:00"],
    [9 * 60 + 5, "09:05"],
    [19 * 60, "19:00"],
    [23 * 60 + 59, "23:59"],
  ])("renders %i as %s", (min, expected) => {
    expect(minToHHMM(min)).toBe(expected);
  });
});

describe("hhmmToMin", () => {
  it.each([
    ["00:00", 0],
    ["08:00", 480],
    ["9:05", 545],
    ["23:59", 1439],
    [" 08:30 ", 510],
  ])("parses %s as %i", (value, expected) => {
    expect(hhmmToMin(value as string)).toBe(expected);
  });

  it.each(["", "8", "8:0", "800", "24:00", "08:60", "8:00 AM", "abc"])(
    "rejects %s",
    (value) => {
      expect(hhmmToMin(value)).toBeNull();
    }
  );

  it("round-trips with minToHHMM", () => {
    for (const min of [0, 1, 480, 725, 1140, 1439]) {
      expect(hhmmToMin(minToHHMM(min))).toBe(min);
    }
  });
});

describe("minToLabel", () => {
  it.each([
    [0, "12:00 AM"],
    [11 * 60 + 59, "11:59 AM"],
    [12 * 60, "12:00 PM"],
    [12 * 60 + 30, "12:30 PM"],
    [19 * 60, "7:00 PM"],
    [23 * 60 + 5, "11:05 PM"],
  ])("renders %i as %s", (min, expected) => {
    expect(minToLabel(min)).toBe(expected);
  });
});

describe("isValidTimezone", () => {
  it("accepts every zone offered in Settings", () => {
    for (const opt of TIMEZONE_OPTIONS) {
      expect(isValidTimezone(opt.value)).toBe(true);
    }
  });

  it("rejects a zone the runtime doesn't know", () => {
    expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("checkWorkHours", () => {
  it("accepts a job inside business hours", () => {
    expect(checkWorkHours(at("2024-07-04", "09:00"), 60, HOURS)).toBeNull();
  });

  it("accepts a job starting exactly at opening", () => {
    expect(checkWorkHours(at("2024-07-04", "08:00"), 60, HOURS)).toBeNull();
  });

  it("accepts a job ending exactly at closing", () => {
    expect(checkWorkHours(at("2024-07-04", "18:00"), 60, HOURS)).toBeNull();
  });

  it("rejects a job starting before opening", () => {
    const err = checkWorkHours(at("2024-07-04", "07:30"), 60, HOURS);
    expect(err).toContain("start before 8:00 AM");
  });

  it("rejects a job finishing after closing", () => {
    const err = checkWorkHours(at("2024-07-04", "18:30"), 60, HOURS);
    expect(err).toContain("7:30 PM");
    expect(err).toContain("7:00 PM cutoff");
  });

  it("reports a sane clock time for a job spilling past midnight", () => {
    // 18:00 + 8h = 02:00 the next day; the message must not say "26:00".
    const err = checkWorkHours(at("2024-07-04", "18:00"), 8 * 60, HOURS);
    expect(err).toContain("2:00 AM");
  });

  it("judges by the business clock, not the host's UTC clock", () => {
    // 13:00 UTC is 09:00 in New York — fine locally, but "before 8am" if the
    // check were done in UTC.
    const start = new Date("2024-07-04T13:00:00Z");
    expect(checkWorkHours(start, 60, HOURS)).toBeNull();
  });

  it("honours custom hours", () => {
    const late: WorkHours = { startMin: 10 * 60, endMin: 22 * 60, timezone: NY };
    expect(checkWorkHours(at("2024-07-04", "09:00"), 60, late)).toContain("10:00 AM");
    expect(checkWorkHours(at("2024-07-04", "21:00"), 60, late)).toBeNull();
  });
});

describe("getWorkHours", () => {
  it("falls back to the defaults when nothing is configured", async () => {
    prismaMock.appSettings.findUnique.mockResolvedValue(null);
    await expect(getWorkHours()).resolves.toEqual({
      startMin: DEFAULT_WORKDAY_START_MIN,
      endMin: DEFAULT_WORKDAY_END_MIN,
      timezone: expect.any(String),
    });
  });

  it("uses the configured hours and zone", async () => {
    prismaMock.appSettings.findUnique.mockResolvedValue({
      workdayStartMin: 420,
      workdayEndMin: 1200,
      timezone: "America/Denver",
    });
    await expect(getWorkHours()).resolves.toEqual({
      startMin: 420,
      endMin: 1200,
      timezone: "America/Denver",
    });
  });

  it("ignores a stored zone the runtime can't resolve", async () => {
    // A bad zone would otherwise throw from every downstream Intl call.
    prismaMock.appSettings.findUnique.mockResolvedValue({
      workdayStartMin: 480,
      workdayEndMin: 1140,
      timezone: "Not/AZone",
    });
    const hours = await getWorkHours();
    expect(isValidTimezone(hours.timezone)).toBe(true);
    expect(hours.timezone).not.toBe("Not/AZone");
  });

  it("getBusinessTimezone returns just the zone", async () => {
    prismaMock.appSettings.findUnique.mockResolvedValue({
      workdayStartMin: 480,
      workdayEndMin: 1140,
      timezone: "America/Chicago",
    });
    await expect(getBusinessTimezone()).resolves.toBe("America/Chicago");
  });
});

describe("findWorkerConflict", () => {
  const existing = (time: string, durationMin: number, name = "Acme Pools") => ({
    startTime: at("2024-07-04", time),
    durationMin,
    client: { name },
  });

  const proposal = (time: string, durationMin: number) => ({
    workerId: "w1",
    startTime: at("2024-07-04", time),
    durationMin,
    timezone: NY,
  });

  it("returns null when the worker has nothing booked", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await expect(findWorkerConflict(proposal("09:00", 60))).resolves.toBeNull();
  });

  it("flags an overlapping job with both sides' labels", async () => {
    prismaMock.task.findMany.mockResolvedValue([existing("09:00", 120, "Blue Lagoon")]);
    await expect(findWorkerConflict(proposal("10:00", 60))).resolves.toEqual({
      clientName: "Blue Lagoon",
      startLabel: "9:00 AM",
      endLabel: "11:00 AM",
    });
  });

  it("flags a proposal that fully contains an existing job", async () => {
    prismaMock.task.findMany.mockResolvedValue([existing("10:00", 30)]);
    await expect(findWorkerConflict(proposal("09:00", 180))).resolves.not.toBeNull();
  });

  it("flags a proposal nested inside an existing job", async () => {
    prismaMock.task.findMany.mockResolvedValue([existing("09:00", 180)]);
    await expect(findWorkerConflict(proposal("10:00", 30))).resolves.not.toBeNull();
  });

  it("allows back-to-back jobs (half-open intervals)", async () => {
    prismaMock.task.findMany.mockResolvedValue([existing("09:00", 60)]);
    // Existing ends 10:00, proposal starts 10:00 — touching, not overlapping.
    await expect(findWorkerConflict(proposal("10:00", 60))).resolves.toBeNull();
  });

  it("allows a job ending exactly when an existing one starts", async () => {
    prismaMock.task.findMany.mockResolvedValue([existing("10:00", 60)]);
    await expect(findWorkerConflict(proposal("09:00", 60))).resolves.toBeNull();
  });

  it("flags an overlap of even one minute", async () => {
    prismaMock.task.findMany.mockResolvedValue([existing("09:00", 61)]);
    await expect(findWorkerConflict(proposal("10:00", 60))).resolves.not.toBeNull();
  });

  it("returns the first conflict when several jobs overlap", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      existing("09:30", 60, "First"),
      existing("10:15", 60, "Second"),
    ]);
    const c = await findWorkerConflict(proposal("10:00", 60));
    expect(c?.clientName).toBe("First");
  });

  it("queries only that worker's non-cancelled jobs", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await findWorkerConflict(proposal("09:00", 60));
    const where = prismaMock.task.findMany.mock.calls[0][0].where;
    expect(where.workerId).toBe("w1");
    expect(where.status).toEqual({ not: "CANCELLED" });
  });

  it("excludes the job being edited so it can't conflict with itself", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await findWorkerConflict({ ...proposal("09:00", 60), excludeTaskId: "t9" });
    expect(prismaMock.task.findMany.mock.calls[0][0].where.id).toEqual({ not: "t9" });
  });

  it("omits the id filter when nothing is being edited", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await findWorkerConflict(proposal("09:00", 60));
    expect(prismaMock.task.findMany.mock.calls[0][0].where.id).toBeUndefined();
  });

  it("fetches a window that straddles the day on both sides", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await findWorkerConflict(proposal("09:00", 60));
    const { gte, lt } = prismaMock.task.findMany.mock.calls[0][0].where.startTime;
    // A day before local midnight through two days after — a long job seeded
    // outside business hours is still caught.
    expect(gte.toISOString()).toBe("2024-07-03T04:00:00.000Z");
    expect(lt.toISOString()).toBe("2024-07-06T04:00:00.000Z");
  });
});

describe("conflictMessage", () => {
  const conflict = {
    clientName: "Blue Lagoon",
    startLabel: "9:00 AM",
    endLabel: "11:00 AM",
  };

  it("names the worker when one is known", () => {
    expect(conflictMessage(conflict, "Dana")).toBe(
      "Dana already has Blue Lagoon's job from 9:00 AM to 11:00 AM. Pick another time or worker."
    );
  });

  it("falls back to a generic subject", () => {
    expect(conflictMessage(conflict)).toMatch(/^That worker already has/);
  });
});
