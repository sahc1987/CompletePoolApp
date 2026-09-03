/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/guard", () => ({
  requireRole: jest.fn().mockResolvedValue({ id: "admin1", role: "ADMIN" }),
}));
jest.mock("@/lib/notify", () => ({
  notifyAll: jest.fn(),
  notifyUser: jest.fn(),
  notifyRoles: jest.fn(),
}));
jest.mock("@/lib/billing", () => ({
  createBillForTask: jest.fn(),
  recordPayment: jest.fn(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { createBillForTask } = jest.requireMock("@/lib/billing");

import { finishTask } from "../actions";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};

const seedTask = (over: Record<string, unknown> = {}) => {
  prismaMock.task.findUnique.mockResolvedValue({
    id: "t1",
    status: "IN_PROGRESS",
    submittedAt: null,
    client: { name: "Blue Lagoon" },
    ...over,
  });
};

/** Nothing logged yet — the usual case for a job an admin closes out. */
const noMaterialsLogged = () => prismaMock.stockMovement.count.mockResolvedValue(0);

beforeEach(() => {
  seedTask();
  noMaterialsLogged();
  prismaMock.material.findMany.mockResolvedValue([
    {
      id: "m1",
      name: "Chlorine",
      unit: "gallon",
      costPrice: 4,
      customerPrice: 9,
    },
  ]);
});

describe("finishTask", () => {
  it("rejects a job that is already finished", async () => {
    seedTask({ status: "APPROVED" });
    const res = await finishTask(null, form({ taskId: "t1" }));
    expect(res).toEqual({ error: "This job is already finished." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a cancelled job", async () => {
    seedTask({ status: "CANCELLED" });
    const res = await finishTask(null, form({ taskId: "t1" }));
    expect(res).toEqual({ error: "This job was cancelled." });
  });

  it("rejects a missing task", async () => {
    prismaMock.task.findUnique.mockResolvedValue(null);
    await expect(finishTask(null, form({ taskId: "t1" }))).resolves.toEqual({
      error: "Task not found",
    });
  });

  it("approves the job and bills it when no material was used", async () => {
    await expect(finishTask(null, form({ taskId: "t1" }))).resolves.toEqual({ ok: true });
    expect(prismaMock.task.update.mock.calls[0][0].data).toMatchObject({
      status: "APPROVED",
      approvedById: "admin1",
    });
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
    expect(createBillForTask).toHaveBeenCalledWith("t1");
  });

  it("records material entered on the finish form", async () => {
    await finishTask(null, form({ taskId: "t1", qty_m1: "2" }));

    expect(prismaMock.taskMaterial.create.mock.calls[0][0].data).toMatchObject({
      taskId: "t1",
      materialId: "m1",
      quantityUsed: 2,
    });
    expect(prismaMock.material.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { quantityOnHand: { decrement: 2 } },
    });
    expect(prismaMock.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      type: "USAGE",
      quantity: -2,
      taskId: "t1",
    });
  });

  it("bills only after the material is written, so the bill includes it", async () => {
    // createBillForTask totals the TaskMaterial rows; billing first would
    // charge the customer for labour alone.
    const order: string[] = [];
    prismaMock.taskMaterial.create.mockImplementation(async () => {
      order.push("material");
      return {};
    });
    createBillForTask.mockImplementation(async () => {
      order.push("bill");
      return {};
    });

    await finishTask(null, form({ taskId: "t1", qty_m1: "2" }));
    expect(order).toEqual(["material", "bill"]);
  });

  it("does not re-count material the crew already logged", async () => {
    // The job was submitted, flagged, reworked, and is now being finished by
    // an admin. Stock came off the shelf the first time round.
    prismaMock.stockMovement.count.mockResolvedValue(1);

    await finishTask(null, form({ taskId: "t1", qty_m1: "2" }));

    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
    expect(prismaMock.material.update).not.toHaveBeenCalled();
    expect(prismaMock.stockMovement.create).not.toHaveBeenCalled();
    // The job still finishes and bills.
    expect(prismaMock.task.update.mock.calls[0][0].data.status).toBe("APPROVED");
    expect(createBillForTask).toHaveBeenCalledWith("t1");
  });

  it("writes the material and the approval in one transaction", async () => {
    await finishTask(null, form({ taskId: "t1", qty_m1: "2" }));
    // A failure mid-way must not leave stock decremented on an unfinished job.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("ignores blank quantity boxes", async () => {
    await finishTask(null, form({ taskId: "t1", qty_m1: "" }));
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
  });

  it("keeps the original submission time when one exists", async () => {
    const submittedAt = new Date("2024-07-04T13:00:00Z");
    seedTask({ status: "SUBMITTED", submittedAt });
    await finishTask(null, form({ taskId: "t1" }));
    expect(prismaMock.task.update.mock.calls[0][0].data.submittedAt).toBe(submittedAt);
  });
});
