/**
 * @jest-environment node
 */
import { Prisma } from "@prisma/client";
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { getAgenda } from "../agendaReads";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Otto" };

// Business zone defaults to New York with no settings row. 2026-10-08 is a Thursday.
const job = (id: string, startTime: string, over: Record<string, unknown> = {}) => ({
  id,
  startTime: new Date(startTime),
  durationMin: 90,
  status: "SCHEDULED",
  price: new Prisma.Decimal(120),
  notes: null,
  flagReason: null,
  serviceId: "s1",
  workerId: "w1",
  recurrenceRuleId: null,
  client: { name: "Casa Verde" },
  pool: { address: "1 Palm Way" },
  service: { name: "Weekly clean" },
  worker: { name: "Wendy" },
  extras: [],
  materials: [],
  bill: { amount: new Prisma.Decimal(150), status: "PARTIAL", method: "CASH", payments: [{ amount: new Prisma.Decimal(50) }] },
  ...over,
});

beforeEach(() => {
  prismaMock.task.findMany.mockReset().mockResolvedValue([]);
});

describe("getAgenda", () => {
  it("covers the Monday–Sunday week around the day, in business time", async () => {
    const res = await getAgenda(admin, "2026-10-08");
    if (!res.ok) throw new Error(res.error);

    const where = prismaMock.task.findMany.mock.calls[0][0].where;
    // Mon Oct 5 00:00 EDT to Mon Oct 12 00:00 EDT.
    expect(where.startTime).toEqual({
      gte: new Date("2026-10-05T04:00:00Z"),
      lt: new Date("2026-10-12T04:00:00Z"),
    });
    expect(res.data.week.map((d) => `${d.weekday} ${d.dateNum}`)).toEqual([
      "Mon 5", "Tue 6", "Wed 7", "Thu 8", "Fri 9", "Sat 10", "Sun 11",
    ]);
    expect(res.data).toMatchObject({ prevWeek: "2026-09-28", nextWeek: "2026-10-12" });
  });

  it("counts each day's jobs and lists only the chosen day's", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      job("a", "2026-10-08T13:00:00Z"), // Thu 9:00 AM
      job("b", "2026-10-08T17:30:00Z"), // Thu 1:30 PM
      job("c", "2026-10-09T13:00:00Z"), // Fri
    ]);
    const res = await getAgenda(admin, "2026-10-08");
    if (!res.ok) throw new Error(res.error);

    expect(res.data.week.find((d) => d.day === "2026-10-08")!.count).toBe(2);
    expect(res.data.week.find((d) => d.day === "2026-10-09")!.count).toBe(1);
    expect(res.data.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    // Labels and the edit form's HH:MM are business-local.
    expect(res.data.tasks[0]).toMatchObject({ timeLabel: "9:00 AM", endLabel: "10:30 AM", time: "09:00" });
  });

  it("gives a worker only their own jobs, without money", async () => {
    prismaMock.task.findMany.mockResolvedValue([job("a", "2026-10-08T13:00:00Z")]);
    const res = await getAgenda(worker, "2026-10-08");
    if (!res.ok) throw new Error(res.error);

    expect(prismaMock.task.findMany.mock.calls[0][0].where.workerId).toBe("w1");
    expect(res.data.tasks[0].price).toBeNull();
    expect(res.data.tasks[0].bill).toBeNull();
  });

  it("shows the owner prices but keeps billing admin-only, like the calendar", async () => {
    prismaMock.task.findMany.mockResolvedValue([job("a", "2026-10-08T13:00:00Z")]);
    const asOwner = await getAgenda(owner, "2026-10-08");
    const asAdmin = await getAgenda(admin, "2026-10-08");
    if (!asOwner.ok || !asAdmin.ok) throw new Error("failed");

    expect(asOwner.data.tasks[0].price).toBe(120);
    expect(asOwner.data.tasks[0].bill).toBeNull();
    expect(asAdmin.data.tasks[0].bill).toEqual({
      amount: 150, paid: 50, balance: 100, status: "PARTIAL", method: "CASH",
    });
  });

  it("falls back to today for a malformed day", async () => {
    const res = await getAgenda(admin, "tomorrow");
    if (!res.ok) throw new Error(res.error);
    expect(res.data.day).toBe(res.data.today);
  });
});
