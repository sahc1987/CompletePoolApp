/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { getTaskWaterTest, listPoolWaterTests, saveWaterTest, waterTestsForClient } from "../waterTests";
import { readingStatus, readingTarget } from "@/contracts/waterTest";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Olive" };

const seedTask = (over: Record<string, unknown> = {}) =>
  prismaMock.task.findUnique.mockResolvedValue({
    id: "t1",
    workerId: "w1",
    poolId: "p1",
    status: "IN_PROGRESS",
    ...over,
  });

const row = (over: Record<string, unknown> = {}) => ({
  id: "wt1",
  taskId: "t1",
  poolId: "p1",
  takenAt: new Date("2026-11-22T15:00:00Z"),
  freeChlorine: 2.5,
  ph: 7.4,
  alkalinity: 100,
  cyanuricAcid: 40,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  seedTask();
});

describe("what counts as in range", () => {
  it("flags low, ok and high against the target", () => {
    expect(readingStatus("freeChlorine", 0.5)).toBe("low");
    expect(readingStatus("freeChlorine", 1)).toBe("ok");
    expect(readingStatus("freeChlorine", 3)).toBe("ok");
    expect(readingStatus("freeChlorine", 3.1)).toBe("high");
    expect(readingStatus("ph", 7.1)).toBe("low");
    expect(readingStatus("cyanuricAcid", 60)).toBe("high");
    expect(readingTarget("ph")).toBe("7.2–7.8");
    expect(readingTarget("alkalinity")).toBe("80–120 ppm");
  });
});

describe("recording a water test", () => {
  it("saves the readings against the worker's own started job", async () => {
    const res = await saveWaterTest(worker, { taskId: "t1", freeChlorine: 2.5, ph: 7.4, alkalinity: 100 });
    expect(res.ok).toBe(true);
    const call = prismaMock.waterTest.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ taskId: "t1" });
    expect(call.create).toMatchObject({ poolId: "p1", recordedById: "w1", freeChlorine: 2.5, ph: 7.4, cyanuricAcid: null });
  });

  it("is safe to replay: the same save writes the same row, never a second", async () => {
    await saveWaterTest(worker, { taskId: "t1", ph: 7.4 });
    await saveWaterTest(worker, { taskId: "t1", ph: 7.4 });
    expect(prismaMock.waterTest.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.waterTest.upsert.mock.calls[0][0].where).toEqual({ taskId: "t1" });
    expect(prismaMock.waterTest.create).not.toHaveBeenCalled();
  });

  it.each([["an admin", admin], ["the read-only owner", owner]])("refuses %s", async (_n, actor) => {
    const res = await saveWaterTest(actor, { taskId: "t1", ph: 7.4 });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.waterTest.upsert).not.toHaveBeenCalled();
  });

  it("answers 404 for someone else's job", async () => {
    seedTask({ workerId: "somebody-else" });
    const res = await saveWaterTest(worker, { taskId: "t1", ph: 7.4 });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prismaMock.waterTest.upsert).not.toHaveBeenCalled();
  });

  it("needs the job started first", async () => {
    seedTask({ status: "SCHEDULED" });
    const res = await saveWaterTest(worker, { taskId: "t1", ph: 7.4 });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });

  it("rejects an empty form and impossible values", async () => {
    expect(await saveWaterTest(worker, { taskId: "t1" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await saveWaterTest(worker, { taskId: "t1", ph: 72 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await saveWaterTest(worker, { taskId: "t1", alkalinity: 90.5 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.waterTest.upsert).not.toHaveBeenCalled();
  });
});

describe("reading them back", () => {
  it("lets a worker read their own job's reading, not another's", async () => {
    prismaMock.waterTest.findUnique.mockResolvedValue({ ...row(), task: { workerId: "w1" } });
    expect(await getTaskWaterTest(worker, "t1")).toMatchObject({ ok: true, data: { ph: 7.4, takenAt: "2026-11-22T15:00:00.000Z" } });

    prismaMock.waterTest.findUnique.mockResolvedValue({ ...row(), task: { workerId: "somebody-else" } });
    expect(await getTaskWaterTest(worker, "t1")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("gives admin and owner a pool's history, and nobody else", async () => {
    prismaMock.waterTest.findMany.mockResolvedValue([row(), row({ id: "wt2" })]);
    const res = await listPoolWaterTests(admin, "p1");
    expect(res).toMatchObject({ ok: true });
    expect(res.ok && res.data).toHaveLength(2);
    expect((await listPoolWaterTests(owner, "p1")).ok).toBe(true);
    expect(await listPoolWaterTests(worker, "p1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("groups a client's readings by pool, capped per pool", async () => {
    prismaMock.pool.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    prismaMock.waterTest.findMany.mockResolvedValue([
      row({ id: "a", poolId: "p1" }), row({ id: "b", poolId: "p1" }), row({ id: "c", poolId: "p2" }),
    ]);
    const res = await waterTestsForClient(admin, "c1", 1);
    expect(res.ok && Object.keys(res.data).sort()).toEqual(["p1", "p2"]);
    expect(res.ok && res.data.p1).toHaveLength(1);
  });
});
