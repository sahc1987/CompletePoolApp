/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/geocode", () => ({
  ensurePoolLocations: jest.fn(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { ensurePoolLocations } = jest.requireMock("@/lib/geocode");

import { getDayRoute } from "../routeReads";
import { updatePool } from "../clients";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Otto" };

// The business zone defaults to New York when there's no settings row.
const job = (over: Record<string, unknown>) => ({
  id: "t1",
  workerId: "w1",
  durationMin: 60,
  status: "SCHEDULED",
  price: 120,
  client: { name: "Casa Verde" },
  service: { name: "Weekly clean" },
  worker: { name: "Wendy" },
  pool: { id: "p1", address: "1 Palm Way", latitude: 40.7, longitude: -73.5, geocodedAt: new Date() },
  ...over,
});

beforeEach(() => {
  prismaMock.task.findMany.mockReset().mockResolvedValue([]);
  prismaMock.pool.findMany.mockReset().mockResolvedValue([]);
});

describe("getDayRoute", () => {
  it("covers exactly one business-local day", async () => {
    await getDayRoute(admin, "2026-10-12");
    const where = prismaMock.task.findMany.mock.calls[0][0].where;
    // Midnight to midnight in New York (EDT), not UTC.
    expect(where.startTime).toEqual({
      gte: new Date("2026-10-12T04:00:00Z"),
      lt: new Date("2026-10-13T04:00:00Z"),
    });
    expect(where.status).toEqual({ not: "CANCELLED" });
  });

  it("gives a worker only their own stops", async () => {
    await getDayRoute(worker, "2026-10-12");
    expect(prismaMock.task.findMany.mock.calls[0][0].where.workerId).toBe("w1");
  });

  it("gives managers every worker's stops", async () => {
    await getDayRoute(admin, "2026-10-12");
    await getDayRoute(owner, "2026-10-12");
    for (const call of prismaMock.task.findMany.mock.calls) {
      expect(call[0].where.workerId).toBeUndefined();
    }
  });

  it("numbers each worker's stops in visit order and carries no money", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      job({ id: "a", workerId: "w1", startTime: new Date("2026-10-12T13:00:00Z") }),
      job({ id: "b", workerId: "w2", worker: { name: "Wes" }, startTime: new Date("2026-10-12T13:30:00Z") }),
      job({ id: "c", workerId: "w1", startTime: new Date("2026-10-12T15:00:00Z") }),
    ]);
    const res = await getDayRoute(admin, "2026-10-12");
    if (!res.ok) throw new Error(res.error);

    expect(res.data.stops.map((s) => [s.taskId, s.order])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 2],
    ]);
    expect(res.data.workers).toEqual([
      { id: "w1", name: "Wendy" },
      { id: "w2", name: "Wes" },
    ]);
    expect(res.data.stops[0].timeLabel).toBe("9:00 AM");
    expect(JSON.stringify(res.data)).not.toContain("price");
  });

  it("places pools that were never looked up, and only those", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      job({
        id: "a",
        startTime: new Date("2026-10-12T13:00:00Z"),
        pool: { id: "new", address: "2 Bay Rd", latitude: null, longitude: null, geocodedAt: null },
      }),
      job({ id: "b", startTime: new Date("2026-10-12T15:00:00Z") }),
    ]);
    prismaMock.pool.findMany.mockResolvedValue([{ id: "new", latitude: 40.6, longitude: -73.4 }]);

    const res = await getDayRoute(worker, "2026-10-12");
    if (!res.ok) throw new Error(res.error);
    expect(ensurePoolLocations).toHaveBeenCalledWith(["new"]);
    expect(res.data.stops[0]).toMatchObject({ lat: 40.6, lng: -73.4 });
  });

  it("navigates by business-local days", async () => {
    const res = await getDayRoute(admin, "2026-11-01"); // the DST change
    if (!res.ok) throw new Error(res.error);
    expect(res.data).toMatchObject({ day: "2026-11-01", prevDay: "2026-10-31", nextDay: "2026-11-02" });
  });

  it("falls back to today for a malformed day", async () => {
    const res = await getDayRoute(admin, "next tuesday");
    if (!res.ok) throw new Error(res.error);
    expect(res.data.day).toBe(res.data.today);
  });
});

describe("a pool's map position", () => {
  it("is cleared when its address changes, so it's looked up again", async () => {
    prismaMock.pool.findUnique.mockResolvedValue({ address: "1 Palm Way" });
    await updatePool(admin, { id: "p1", address: "9 New St" });
    expect(prismaMock.pool.update.mock.calls[0][0].data).toMatchObject({
      latitude: null,
      longitude: null,
      geocodedAt: null,
    });
  });

  it("is kept when only the size or type changes", async () => {
    prismaMock.pool.findUnique.mockResolvedValue({ address: "1 Palm Way" });
    await updatePool(admin, { id: "p1", address: "1 Palm Way", size: "Large" });
    expect(prismaMock.pool.update.mock.calls[0][0].data).not.toHaveProperty("geocodedAt");
  });
});
