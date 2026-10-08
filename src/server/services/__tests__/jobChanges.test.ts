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
const { notifyRoles, notifyUser } = jest.requireMock("@/lib/notify");

import {
  cancelTask,
  editTask,
  endSeries,
  rescheduleTask,
} from "../scheduling";
import { createMaterialRequest, submitTask } from "../worker";
import { approveTask, flagTask } from "../review";
import { respondMaterialRequest } from "../materials";
import { scheduleEstimate } from "../estimates";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };

// 10:00 in New York (EDT), the default business zone when no settings row exists.
const MON_10AM = new Date("2026-10-12T14:00:00Z");
const NEXT_MON_10AM = new Date("2026-10-19T14:00:00Z");

const seedTask = (over: Record<string, unknown> = {}) => {
  prismaMock.task.findUnique.mockResolvedValue({
    id: "t1",
    workerId: "w1",
    status: "SCHEDULED",
    startTime: MON_10AM,
    date: new Date("2026-10-12T04:00:00Z"),
    recurrenceRuleId: null,
    flagReason: null,
    client: { name: "Casa Verde" },
    worker: { name: "Wendy" },
    service: { name: "Weekly clean" },
    ...over,
  });
};

beforeEach(() => {
  seedTask();
  prismaMock.stockMovement.count.mockResolvedValue(0);
  // clearMocks resets calls, not stubbed results — a list seeded by one test
  // would otherwise turn up as a double booking in the next.
  prismaMock.task.findMany.mockReset().mockResolvedValue([]);
  prismaMock.stockMovement.findMany.mockReset().mockResolvedValue([]);
});

describe("cancelling a job", () => {
  it("puts logged material back on the shelf once per material", async () => {
    seedTask({ status: "IN_PROGRESS" });
    prismaMock.stockMovement.findMany.mockResolvedValue([
      { materialId: "m1", quantity: -3 },
      { materialId: "m1", quantity: -2 },
      { materialId: "m2", quantity: -1 },
    ]);

    const res = await cancelTask(admin, { taskId: "t1" });
    expect(res.ok).toBe(true);

    const restocked = prismaMock.material.update.mock.calls.map((c) => c[0]);
    expect(restocked).toEqual([
      { where: { id: "m1" }, data: { quantityOnHand: { increment: 5 } } },
      { where: { id: "m2" }, data: { quantityOnHand: { increment: 1 } } },
    ]);
    const movements = prismaMock.stockMovement.create.mock.calls.map((c) => c[0].data);
    expect(movements).toEqual([
      expect.objectContaining({ materialId: "m1", type: "REVERSAL", quantity: 5, taskId: "t1" }),
      expect.objectContaining({ materialId: "m2", type: "REVERSAL", quantity: 1, taskId: "t1" }),
    ]);
    expect(prismaMock.task.update.mock.calls[0][0].data).toEqual({ status: "CANCELLED" });
    expect(notifyUser).toHaveBeenCalledWith("w1", expect.stringContaining("cancelled"), {
      link: "/worker",
    });
  });

  it("won't cancel a job that has been billed", async () => {
    seedTask({ status: "APPROVED" });
    const res = await cancelTask(admin, { taskId: "t1" });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("won't cancel twice, so stock is never given back twice", async () => {
    seedTask({ status: "CANCELLED" });
    const res = await cancelTask(admin, { taskId: "t1" });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.material.update).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    const res = await cancelTask(worker, { taskId: "t1" });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("ending a repeating series", () => {
  it("ends the rule on this job's day and cancels later unstarted jobs", async () => {
    seedTask({ recurrenceRuleId: "r1" });
    prismaMock.task.findMany.mockResolvedValue([
      { id: "t2", workerId: "w1" },
      { id: "t3", workerId: "w1" },
    ]);

    const res = await endSeries(admin, { taskId: "t1" });
    expect(res).toEqual({ ok: true, data: { cancelled: 2 } });

    expect(prismaMock.task.findMany.mock.calls[0][0].where).toMatchObject({
      recurrenceRuleId: "r1",
      status: "SCHEDULED",
      startTime: { gt: MON_10AM },
    });
    expect(prismaMock.recurrenceRule.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { endDate: new Date("2026-10-12T04:00:00Z") },
    });
    expect(prismaMock.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t2", "t3"] } },
      data: { status: "CANCELLED" },
    });
    // One message per worker, not one per job.
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });

  it("refuses a job that doesn't repeat", async () => {
    const res = await endSeries(admin, { taskId: "t1" });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });
});

describe("finished jobs are locked", () => {
  const edit = {
    taskId: "t1",
    workerId: "w1",
    serviceId: "s1",
    date: "2026-10-12",
    time: "10:00",
    durationMin: 60,
    price: 80,
  };

  it("won't edit an approved job", async () => {
    seedTask({ status: "APPROVED" });
    const res = await editTask(admin, edit);
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("won't drag an approved job to a new time", async () => {
    seedTask({ status: "APPROVED" });
    const res = await rescheduleTask(admin, {
      taskId: "t1",
      startISO: NEXT_MON_10AM.toISOString(),
      durationMin: 60,
    });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });

  it("applies an edit to the rest of the series, keeping each job's own date", async () => {
    seedTask({ recurrenceRuleId: "r1" });
    // First findMany is the rest of the series; the conflict checks get [].
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "t2", startTime: NEXT_MON_10AM },
    ]);
    prismaMock.task.update.mockResolvedValue({
      workerId: "w1",
      client: { name: "Casa Verde" },
      worker: { name: "Wendy" },
      service: { name: "Weekly clean" },
    });

    const res = await editTask(admin, { ...edit, time: "11:00", applyToSeries: true });
    expect(res.ok).toBe(true);

    const updates = prismaMock.task.update.mock.calls.map((c) => c[0]);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      where: { id: "t2" },
      data: { startTime: new Date("2026-10-19T15:00:00Z"), price: 80 },
    });
    expect(updates[1]).toMatchObject({
      where: { id: "t1" },
      data: { startTime: new Date("2026-10-12T15:00:00Z") },
    });
  });

  it("refuses a series edit on a job that doesn't repeat", async () => {
    const res = await editTask(admin, { ...edit, applyToSeries: true });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });
});

describe("the people who need to act are notified", () => {
  it("tells admins a job was submitted", async () => {
    seedTask({ status: "IN_PROGRESS" });
    await submitTask(worker, { taskId: "t1", usage: [] });
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN"],
      "Wendy submitted Casa Verde's job for review.",
      { link: "/review" }
    );
  });

  it("tells the worker their job was flagged, with the reason", async () => {
    seedTask({ status: "SUBMITTED" });
    await flagTask(admin, { taskId: "t1", reason: "Missing after photo" });
    expect(notifyUser).toHaveBeenCalledWith(
      "w1",
      "Casa Verde's job was sent back for rework: Missing after photo",
      { link: "/worker" }
    );
  });

  it("tells the worker their job was approved", async () => {
    seedTask({ status: "SUBMITTED" });
    await approveTask(admin, { taskId: "t1" });
    expect(notifyUser).toHaveBeenCalledWith("w1", "Casa Verde's job was approved.", {
      link: "/worker",
    });
  });

  it("tells admins about a material request, marking urgent ones", async () => {
    prismaMock.materialRequest.create.mockResolvedValue({
      id: "mr1",
      material: { name: "Chlorine", unit: "gallon" },
    });
    await createMaterialRequest(worker, {
      materialId: "m1",
      quantityRequested: 4,
      urgent: true,
    });
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN"],
      "URGENT: Wendy requested 4 gallon of Chlorine.",
      { link: "/materials" }
    );
  });

  it("tells the worker how their material request was answered", async () => {
    prismaMock.materialRequest.findUnique.mockResolvedValue({
      id: "mr1",
      status: "PENDING",
      workerId: "w1",
      description: null,
      material: { name: "Chlorine" },
    });
    await respondMaterialRequest(admin, {
      requestId: "mr1",
      decision: "DENIED",
      note: "Use the spare in the van",
    });
    expect(notifyUser).toHaveBeenCalledWith(
      "w1",
      "Your request for Chlorine was denied: Use the spare in the van",
      { link: "/worker" }
    );
  });
});

describe("scheduling a signed estimate", () => {
  const input = {
    estimateId: "e1",
    poolId: "p1",
    workerId: "w1",
    serviceId: "s1",
    date: "2026-10-12",
    time: "10:00",
    durationMin: 90,
    price: 450,
  };

  const seedEstimate = (over: Record<string, unknown> = {}) =>
    prismaMock.estimate.findUnique.mockResolvedValue({
      id: "e1",
      clientId: "c1",
      status: "APPROVED",
      convertedTaskId: null,
      lineItems: [{ description: "Pump repair" }],
      ...over,
    });

  it("creates the job through createTask and links it to the estimate", async () => {
    seedEstimate();
    prismaMock.pool.findUnique.mockResolvedValue({ id: "p1", clientId: "c1" });
    prismaMock.task.create.mockResolvedValue({
      id: "t9",
      startTime: MON_10AM,
      client: { name: "Casa Verde" },
      pool: { address: "1 Palm Way" },
      service: { name: "Repair" },
      worker: { name: "Wendy" },
    });

    const res = await scheduleEstimate(admin, input);
    expect(res).toEqual({ ok: true, data: { taskId: "t9" } });
    expect(prismaMock.task.create.mock.calls[0][0].data).toMatchObject({
      clientId: "c1",
      poolId: "p1",
      price: 450,
      notes: "From signed estimate: Pump repair",
    });
    expect(prismaMock.estimate.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { convertedTaskId: "t9" },
    });
  });

  it("refuses an estimate the client hasn't signed", async () => {
    seedEstimate({ status: "PRESENTED" });
    const res = await scheduleEstimate(admin, input);
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("refuses to schedule the same estimate twice", async () => {
    seedEstimate({ convertedTaskId: "t1" });
    const res = await scheduleEstimate(admin, input);
    expect(res).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("refuses a pool that belongs to another client", async () => {
    seedEstimate();
    prismaMock.pool.findUnique.mockResolvedValue({ id: "p1", clientId: "other" });
    const res = await scheduleEstimate(admin, input);
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.estimate.update).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    const res = await scheduleEstimate(worker, input);
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
