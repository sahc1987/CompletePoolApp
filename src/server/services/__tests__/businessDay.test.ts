/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { getBusinessDay, listMyTasks } from "../taskReads";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };

/** The business runs on New York time; the server runs UTC on Vercel. */
const inNewYork = () =>
  prismaMock.appSettings.findUnique.mockResolvedValue({
    id: "app",
    timezone: "America/New_York",
    workdayStartMin: 480,
    workdayEndMin: 1140,
  });

const seedTask = (startTime: Date) =>
  prismaMock.task.findMany.mockResolvedValue([
    {
      id: "t1",
      status: "SCHEDULED",
      startTime,
      durationMin: 60,
      price: 100,
      notes: null,
      flagReason: null,
      submittedAt: null,
      client: { name: "Casa Verde", phone: null },
      pool: { address: "1 Pool Ln" },
      service: { name: "Weekly clean" },
    },
  ]);

afterEach(() => {
  jest.useRealTimers();
});

/**
 * The bug this guards against: a job at 8pm Eastern is already "tomorrow" in
 * UTC. Slicing the date off an ISO string — or letting a phone decide — puts
 * that job on the wrong day of the worker's list, every evening.
 */
describe("a task's business-local day", () => {
  it("uses the business timezone, not UTC", async () => {
    inNewYork();
    // 2026-09-15T01:30Z is 2026-09-14 at 21:30 in New York.
    seedTask(new Date("2026-09-15T01:30:00.000Z"));

    const res = await listMyTasks(worker);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data[0].startTime).toBe("2026-09-15T01:30:00.000Z");
    expect(res.data[0].dayKey).toBe("2026-09-14");
    // The naive implementation, for contrast.
    expect(res.data[0].dayKey).not.toBe(res.data[0].startTime.slice(0, 10));
  });

  it("agrees with UTC when the job is mid-morning", async () => {
    inNewYork();
    seedTask(new Date("2026-09-15T14:00:00.000Z")); // 10:00 in New York
    const res = await listMyTasks(worker);
    if (!res.ok) throw new Error(res.error);
    expect(res.data[0].dayKey).toBe("2026-09-15");
  });
});

describe("getBusinessDay", () => {
  it("reports today and tomorrow in the business zone", async () => {
    inNewYork();
    // 03:00 UTC on the 15th is still the evening of the 14th in New York.
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-15T03:00:00.000Z"));

    const day = await getBusinessDay();
    expect(day.timezone).toBe("America/New_York");
    expect(day.today).toBe("2026-09-14");
    expect(day.tomorrow).toBe("2026-09-15");
  });

  it("crosses a month boundary correctly", async () => {
    inNewYork();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-30T16:00:00.000Z")); // noon on the 30th
    const day = await getBusinessDay();
    expect(day.today).toBe("2026-09-30");
    expect(day.tomorrow).toBe("2026-10-01");
  });

  it("falls back to a usable zone when the stored one is nonsense", async () => {
    prismaMock.appSettings.findUnique.mockResolvedValue({
      id: "app",
      timezone: "Not/AZone",
      workdayStartMin: 480,
      workdayEndMin: 1140,
    });
    const day = await getBusinessDay();
    // Anything but a throw: a bad setting must not take every date calculation
    // in the app down with it.
    expect(day.timezone).toBeTruthy();
    expect(day.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
