/** @jest-environment node */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({ prisma: require("@/test/prismaMock").createPrismaMock() }));
jest.mock("@/lib/geocode", () => ({ ensurePoolLocations: jest.fn() }));
jest.mock("@/lib/schedule", () => ({
  getWorkHours: jest.fn().mockResolvedValue({ timezone: "UTC", startMin: 0, endMin: 1440 }),
  checkWorkHours: jest.fn().mockReturnValue(null),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
import { rankWorkers } from "../workerFit";

const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const at = (h: number, day = 25) => new Date(Date.UTC(2026, 10, day, h));
const job = (workerId: string, h: number, lng: number, client = "Other") => ({
  workerId, startTime: at(h), durationMin: 60,
  client: { name: client }, pool: { latitude: 0, longitude: lng },
});
const input = { clientId: "c1", poolId: "p1", date: "2026-11-25", time: "10:00", durationMin: 60 };

beforeEach(() => {
  prismaMock.user.findMany.mockResolvedValue([
    { id: "near", name: "Near" }, { id: "far", name: "Far" }, { id: "busy", name: "Busy" },
  ]);
  prismaMock.pool.findUnique.mockResolvedValue({
    id: "p1", clientId: "c1", latitude: 0, longitude: 0.01, geocodedAt: new Date(),
  });
  prismaMock.task.findMany
    .mockResolvedValueOnce([
      job("near", 9, 0.02), // 1 km-ish from the new pool
      job("far", 9, 0.5), // ~55 km away
      job("busy", 10, 0.01, "Smith"), // overlaps 10:00
    ])
    .mockResolvedValueOnce([{ workerId: "far" }]); // far is the client's usual worker
});

test("a worker nearby ranks first; a clash goes last with the reason", async () => {
  const r = await rankWorkers(admin, input);
  if (!r.ok) throw new Error(r.error);
  expect(r.data.map((f) => f.workerId)).toEqual(["near", "far", "busy"]);
  expect(r.data[0].extraKm).toBeLessThan(2);
  expect(r.data[1].usual).toBe(true);
  expect(r.data[2].clashes).toBe(1);
  expect(r.data[2].clashNote).toContain("Smith");
});

test("only admins can ask", async () => {
  const r = await rankWorkers({ id: "w", role: "WORKER", name: "W" }, input);
  expect(r.ok).toBe(false);
});
