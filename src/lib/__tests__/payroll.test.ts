/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;

import { startOfWeek, weeklyHours, weekLabel, hoursLabel } from "../payroll";
import { parseZonedDateTime, zonedDayKey } from "../timezone";

const NY = "America/New_York";
const at = (date: string, time = "09:00") => parseZonedDateTime(date, time, NY)!;

describe("startOfWeek", () => {
  it("returns the Monday of the week containing a midweek day", () => {
    // 2024-07-04 is a Thursday.
    expect(zonedDayKey(startOfWeek(at("2024-07-04"), NY), NY)).toBe("2024-07-01");
  });

  it("treats Sunday as the last day of the week", () => {
    expect(zonedDayKey(startOfWeek(at("2024-07-07"), NY), NY)).toBe("2024-07-01");
  });

  it("is idempotent", () => {
    const monday = startOfWeek(at("2024-07-04"), NY);
    expect(startOfWeek(monday, NY).getTime()).toBe(monday.getTime());
  });
});

describe("hoursLabel", () => {
  it.each([
    [0, "0m"],
    [45, "45m"],
    [60, "1h"],
    [90, "1h 30m"],
    [480, "8h"],
    [605, "10h 5m"],
  ])("renders %i minutes as %s", (minutes, expected) => {
    expect(hoursLabel(minutes)).toBe(expected);
  });
});

describe("weekLabel", () => {
  it("spans Monday to Sunday", () => {
    expect(weekLabel(startOfWeek(at("2024-07-04"), NY), NY)).toBe("Jul 1 – Jul 7");
  });

  it("reads correctly across a month boundary", () => {
    expect(weekLabel(startOfWeek(at("2024-07-30"), NY), NY)).toBe("Jul 29 – Aug 4");
  });
});

describe("weeklyHours", () => {
  const RATE = 20;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(at("2024-07-04", "12:00")); // a Thursday
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** The bucket for the week containing `date`. */
  const weekOf = <T extends { weekStart: Date }>(rows: T[], date: string) =>
    rows.find(
      (r) => zonedDayKey(r.weekStart, NY) === zonedDayKey(startOfWeek(at(date), NY), NY)
    );

  it("returns one bucket per requested week, newest first", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    const rows = await weeklyHours("u1", { weeks: 4, timezone: NY });
    expect(rows).toHaveLength(4);
    const stamps = rows.map((r) => r.weekStart.getTime());
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
    expect(zonedDayKey(rows[0].weekStart, NY)).toBe("2024-07-01"); // current week
  });

  it("includes empty weeks as zeroes so a gap is visible", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    const rows = await weeklyHours("u1", { weeks: 3, timezone: NY, hourlyRate: RATE });
    for (const r of rows) {
      expect(r).toMatchObject({ jobs: 0, minutes: 0, hours: 0, pay: 0 });
    }
  });

  it("sums a week's jobs and minutes into the right bucket", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      { startTime: at("2024-07-01"), durationMin: 90 },
      { startTime: at("2024-07-03"), durationMin: 150 },
      { startTime: at("2024-06-26"), durationMin: 60 }, // previous week
    ]);
    const rows = await weeklyHours("u1", { weeks: 4, timezone: NY });
    expect(weekOf(rows, "2024-07-01")).toMatchObject({ jobs: 2, minutes: 240, hours: 4 });
    expect(weekOf(rows, "2024-06-26")).toMatchObject({ jobs: 1, minutes: 60, hours: 1 });
  });

  it("multiplies hours by the rate, rounded to cents", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      { startTime: at("2024-07-02"), durationMin: 95 }, // 1.58h
    ]);
    const rows = await weeklyHours("u1", { weeks: 2, timezone: NY, hourlyRate: RATE });
    const week = weekOf(rows, "2024-07-02")!;
    expect(week.hours).toBe(1.58);
    expect(week.pay).toBe(31.6);
  });

  it("leaves pay null when the worker has no rate", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      { startTime: at("2024-07-02"), durationMin: 60 },
    ]);
    const rows = await weeklyHours("u1", { weeks: 2, timezone: NY });
    expect(rows.every((r) => r.pay === null)).toBe(true);
  });

  it("drops a job that falls outside the reported window", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      { startTime: at("2023-01-04"), durationMin: 600 },
    ]);
    const rows = await weeklyHours("u1", { weeks: 2, timezone: NY });
    expect(rows.every((r) => r.minutes === 0)).toBe(true);
  });

  it("counts only worked statuses, for that worker, in the window", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await weeklyHours("u1", { weeks: 4, timezone: NY });
    const where = prismaMock.task.findMany.mock.calls[0][0].where;
    expect(where.workerId).toBe("u1");
    // Scheduled and in-progress work hasn't been performed yet; flagged work
    // has been, even if it needs redoing.
    expect(where.status.in.sort()).toEqual(["APPROVED", "FLAGGED", "SUBMITTED"]);
    expect(zonedDayKey(where.startTime.gte, NY)).toBe("2024-06-10");
    expect(zonedDayKey(where.startTime.lt, NY)).toBe("2024-07-08");
  });

  it("defaults to eight weeks", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    await expect(weeklyHours("u1", { timezone: NY })).resolves.toHaveLength(8);
  });
});
