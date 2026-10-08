/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/notify", () => ({
  notifyAll: jest.fn(),
  notifyUser: jest.fn(),
  notifyRoles: jest.fn(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { notifyRoles } = jest.requireMock("@/lib/notify");

import { expandRecurrences } from "../recurrence";

// Business zone defaults to New York when there's no settings row.
const job = (over: Record<string, unknown>) => ({
  clientId: "c1",
  poolId: "p1",
  serviceId: "s1",
  durationMin: 60,
  status: "SCHEDULED",
  extras: [],
  client: { name: "Casa Verde" },
  worker: { name: "Wendy" },
  ...over,
});

/** A monthly series started on the 31st, with jobs created through October. */
const monthlyOn31st = (tasks: unknown[]) =>
  prismaMock.recurrenceRule.findMany.mockResolvedValue([
    {
      id: "r1",
      frequency: "MONTHLY",
      daysOfWeek: [],
      startDate: new Date("2026-08-31T04:00:00Z"),
      endDate: null,
      tasks,
    },
  ]);

const history = [
  job({
    id: "aug",
    workerId: "w1",
    price: 50,
    date: new Date("2026-08-31T04:00:00Z"),
    startTime: new Date("2026-08-31T14:00:00Z"),
  }),
  job({
    id: "sep",
    workerId: "w1",
    price: 50,
    date: new Date("2026-09-30T04:00:00Z"),
    startTime: new Date("2026-09-30T14:00:00Z"),
  }),
  // The latest job was moved to another worker and repriced, with an add-on.
  job({
    id: "oct",
    workerId: "w2",
    price: 70,
    extras: [{ extraServiceId: "x1", priceAtTimeOfSale: 15 }],
    date: new Date("2026-10-31T04:00:00Z"),
    startTime: new Date("2026-10-31T14:00:00Z"),
  }),
];

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-11-10T12:00:00Z"));
  // No existing bookings unless a test seeds them.
  prismaMock.task.findMany.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  jest.useRealTimers();
});

describe("expandRecurrences", () => {
  it("lands a 31st-of-the-month series on the last day of a shorter month", async () => {
    monthlyOn31st(history);
    await expandRecurrences();

    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.task.create.mock.calls[0][0].data;
    // Nov 30, 10:00 local — EST by then, so 15:00 UTC.
    expect(data.startTime).toEqual(new Date("2026-11-30T15:00:00Z"));
  });

  it("copies the latest job, add-ons included, not the first one", async () => {
    monthlyOn31st(history);
    await expandRecurrences();

    expect(prismaMock.task.create.mock.calls[0][0].data).toMatchObject({
      workerId: "w2",
      price: 70,
      extras: { create: [{ extraServiceId: "x1", priceAtTimeOfSale: 15 }] },
    });
  });

  it("ignores a cancelled job when picking the template", async () => {
    monthlyOn31st([
      ...history,
      job({
        id: "cancelled",
        workerId: "w3",
        price: 1,
        status: "CANCELLED",
        date: new Date("2026-11-01T04:00:00Z"),
        startTime: new Date("2026-11-01T14:00:00Z"),
      }),
    ]);
    await expandRecurrences();
    expect(prismaMock.task.create.mock.calls[0][0].data.workerId).toBe("w2");
  });

  it("still creates a double-booked job but tells the admins", async () => {
    monthlyOn31st(history);
    prismaMock.task.findMany.mockResolvedValue([
      {
        startTime: new Date("2026-11-30T15:30:00Z"),
        durationMin: 60,
        client: { name: "Blue Lagoon" },
      },
    ]);
    await expandRecurrences();

    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN"],
      expect.stringContaining("Wendy on 2026-11-30"),
      { link: "/calendar" }
    );
  });
});
