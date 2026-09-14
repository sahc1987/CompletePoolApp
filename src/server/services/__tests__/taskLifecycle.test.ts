/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/billing", () => ({
  ...jest.requireActual("@/lib/billing"),
  createBillForTask: jest.fn().mockResolvedValue({ id: "bill-1" }),
}));
jest.mock("@/lib/notify", () => ({
  notifyAll: jest.fn(),
  notifyUser: jest.fn(),
  notifyRoles: jest.fn(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { createBillForTask } = jest.requireMock("@/lib/billing");

import { startTask, submitTask } from "../worker";
import { approveTask, flagTask } from "../review";
import { finishTask } from "../scheduling";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };

const seedTask = (over: Record<string, unknown> = {}) => {
  prismaMock.task.findUnique.mockResolvedValue({
    id: "t1",
    workerId: "w1",
    status: "SCHEDULED",
    submittedAt: null,
    client: { name: "Casa Verde" },
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

describe("a worker only moves their own jobs", () => {
  it("won't start someone else's job", async () => {
    seedTask({ workerId: "somebody-else" });
    const res = await startTask(worker, { taskId: "t1" });
    // NOT_FOUND rather than FORBIDDEN on purpose: a worker has no business
    // learning which task ids exist.
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("won't submit someone else's job", async () => {
    seedTask({ workerId: "somebody-else", status: "IN_PROGRESS" });
    const res = await submitTask(worker, { taskId: "t1", usage: [] });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("the task state machine", () => {
  it("starts a scheduled job", async () => {
    const res = await startTask(worker, { taskId: "t1" });
    expect(res.ok).toBe(true);
    expect(prismaMock.task.update.mock.calls[0][0].data.status).toBe("IN_PROGRESS");
  });

  it("restarts a flagged job so it can be reworked", async () => {
    seedTask({ status: "FLAGGED" });
    const res = await startTask(worker, { taskId: "t1" });
    expect(res.ok).toBe(true);
  });

  it("won't restart an approved job", async () => {
    seedTask({ status: "APPROVED" });
    const res = await startTask(worker, { taskId: "t1" });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("won't submit a job that isn't in progress", async () => {
    seedTask({ status: "SCHEDULED" });
    const res = await submitTask(worker, { taskId: "t1", usage: [] });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });

  it("only approves a submitted job", async () => {
    seedTask({ status: "IN_PROGRESS" });
    const res = await approveTask(admin, { taskId: "t1" });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(createBillForTask).not.toHaveBeenCalled();
  });

  it("bills a job on approval", async () => {
    seedTask({ status: "SUBMITTED" });
    const res = await approveTask(admin, { taskId: "t1" });
    expect(res.ok).toBe(true);
    expect(prismaMock.task.update.mock.calls[0][0].data).toMatchObject({
      status: "APPROVED",
      approvedById: "a1",
      // A stale reason from a previous review round would otherwise stick.
      flagReason: null,
    });
    expect(createBillForTask).toHaveBeenCalledWith("t1");
  });

  it("requires a reason to flag", async () => {
    seedTask({ status: "SUBMITTED" });
    const res = await flagTask(admin, { taskId: "t1", reason: "  " });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("won't finish an already-finished job", async () => {
    seedTask({ status: "APPROVED" });
    const res = await finishTask(admin, { taskId: "t1", usage: [] });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });

  it("won't finish a cancelled job", async () => {
    seedTask({ status: "CANCELLED" });
    const res = await finishTask(admin, { taskId: "t1", usage: [] });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });
});

/**
 * Stock leaves the shelf once per job. A job that was submitted, flagged and
 * reworked passes the close-out path again, and counting the material twice
 * would drain inventory that never left the truck — and double-bill for it.
 */
describe("material usage is counted exactly once", () => {
  it("records usage on a first submit", async () => {
    seedTask({ status: "IN_PROGRESS" });
    prismaMock.stockMovement.count.mockResolvedValue(0);
    const res = await submitTask(worker, {
      taskId: "t1",
      usage: [{ materialId: "m1", qty: 2 }],
    });
    expect(res.ok).toBe(true);
    expect(prismaMock.taskMaterial.create).toHaveBeenCalled();
    expect(prismaMock.material.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantityOnHand: { decrement: 2 } } })
    );
  });

  it("does not record it again on a re-submit after a flag", async () => {
    seedTask({ status: "IN_PROGRESS" });
    prismaMock.stockMovement.count.mockResolvedValue(1); // already logged
    const res = await submitTask(worker, {
      taskId: "t1",
      usage: [{ materialId: "m1", qty: 2 }],
    });
    expect(res.ok).toBe(true);
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
    expect(prismaMock.material.update).not.toHaveBeenCalled();
  });

  it("does not double-count when an admin finishes a job the worker submitted", async () => {
    seedTask({ status: "SUBMITTED" });
    prismaMock.stockMovement.count.mockResolvedValue(1);
    const res = await finishTask(admin, {
      taskId: "t1",
      usage: [{ materialId: "m1", qty: 5 }],
    });
    expect(res.ok).toBe(true);
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
  });

  it("bills only after the material rows are written", async () => {
    seedTask({ status: "SUBMITTED" });
    prismaMock.stockMovement.count.mockResolvedValue(0);
    await finishTask(admin, {
      taskId: "t1",
      usage: [{ materialId: "m1", qty: 1 }],
    });
    // The bill totals those rows, so it has to see them: the transaction must
    // have committed before createBillForTask runs.
    const txOrder = prismaMock.$transaction.mock.invocationCallOrder[0];
    const billOrder = createBillForTask.mock.invocationCallOrder[0];
    expect(txOrder).toBeLessThan(billOrder);
  });
});
