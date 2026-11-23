/** @jest-environment node */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({ prisma: require("@/test/prismaMock").createPrismaMock() }));
jest.mock("@/lib/notify", () => ({ notifyUser: jest.fn() }));
jest.mock("@/lib/schedule", () => ({
  getWorkHours: jest.fn().mockResolvedValue({ timezone: "UTC", startMin: 0, endMin: 1440 }),
  checkWorkHours: jest.fn().mockReturnValue(null),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
import { applyRouteOrder } from "../routePlanning";

const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const at = (h: number) => new Date(Date.UTC(2026, 10, 25, h));
const task = (id: string, h: number, durationMin = 60) => ({
  id, status: "SCHEDULED", startTime: at(h), durationMin,
});
const input = (taskIds: string[]) => ({ day: "2026-11-25", workerId: "w1", taskIds });

beforeEach(() => jest.clearAllMocks());

test("a worker can't reorder", async () => {
  const r = await applyRouteOrder(worker, input(["a", "b"]));
  expect(r.ok).toBe(false);
});

test("hands the same time slots out in the new order", async () => {
  prismaMock.task.findMany.mockResolvedValue([task("a", 9), task("b", 10), task("c", 11)]);
  prismaMock.$transaction.mockResolvedValue([]);
  const r = await applyRouteOrder(admin, input(["c", "a", "b"]));
  expect(r.ok).toBe(true);
  const updates = prismaMock.task.update.mock.calls.map((c: any) => [c[0].where.id, c[0].data.startTime]);
  expect(updates).toEqual([["c", at(9)], ["a", at(10)], ["b", at(11)]]);
});

test("refuses when the day changed or a longer job would overrun", async () => {
  prismaMock.task.findMany.mockResolvedValue([task("a", 9), task("b", 10)]);
  expect((await applyRouteOrder(admin, input(["a", "x"]))).ok).toBe(false);
  prismaMock.task.findMany.mockResolvedValue([task("a", 9, 30), task("b", 10, 120), task("c", 11)]);
  expect((await applyRouteOrder(admin, input(["b", "a", "c"]))).ok).toBe(false);
});
