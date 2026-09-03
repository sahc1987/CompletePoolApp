/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/guard", () => ({
  requireRole: jest.fn().mockResolvedValue({ id: "w1", role: "WORKER" }),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { submitTask } from "../actions";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};

const seedTask = (over: Record<string, unknown> = {}) => {
  prismaMock.task.findUnique.mockResolvedValue({
    id: "t1",
    workerId: "w1",
    status: "IN_PROGRESS",
    ...over,
  });
};

beforeEach(() => {
  seedTask();
  prismaMock.stockMovement.count.mockResolvedValue(0);
  prismaMock.material.findMany.mockResolvedValue([
    { id: "m1", name: "Chlorine", unit: "gallon", costPrice: 4, customerPrice: 9 },
  ]);
});

describe("submitTask", () => {
  it("refuses a job belonging to another worker", async () => {
    seedTask({ workerId: "someone-else" });
    await expect(submitTask(null, form({ taskId: "t1" }))).resolves.toEqual({
      error: "Task not found.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a job that isn't in progress", async () => {
    seedTask({ status: "SCHEDULED" });
    await expect(submitTask(null, form({ taskId: "t1" }))).resolves.toEqual({
      error: "This task isn't in progress.",
    });
  });

  it("submits a job with no material used", async () => {
    await expect(submitTask(null, form({ taskId: "t1" }))).resolves.toEqual({ ok: true });
    const data = prismaMock.task.update.mock.calls[0][0].data;
    expect(data.status).toBe("SUBMITTED");
    expect(data.submittedAt).toBeInstanceOf(Date);
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
  });

  it("logs material used and takes it off the shelf", async () => {
    await submitTask(null, form({ taskId: "t1", qty_m1: "1.5" }));
    expect(prismaMock.taskMaterial.create.mock.calls[0][0].data).toMatchObject({
      taskId: "t1",
      materialId: "m1",
      quantityUsed: 1.5,
      costPriceAtTimeOfUse: 4,
      customerPriceAtTimeOfUse: 9,
    });
    expect(prismaMock.material.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { quantityOnHand: { decrement: 1.5 } },
    });
  });

  it("does not decrement stock twice on a reworked job", async () => {
    // Submitted once, flagged, reworked, submitted again — the material left
    // the truck the first time.
    prismaMock.stockMovement.count.mockResolvedValue(1);
    await submitTask(null, form({ taskId: "t1", qty_m1: "2" }));
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
    expect(prismaMock.material.update).not.toHaveBeenCalled();
    // It still gets submitted for review.
    expect(prismaMock.task.update.mock.calls[0][0].data.status).toBe("SUBMITTED");
  });

  it("writes the material and the status change in one transaction", async () => {
    await submitTask(null, form({ taskId: "t1", qty_m1: "2" }));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
