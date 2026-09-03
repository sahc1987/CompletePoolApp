/**
 * @jest-environment node
 */
import { Prisma } from "@prisma/client";
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;

import {
  parseMaterialUsage,
  hasLoggedMaterials,
  recordTaskMaterials,
  type MaterialUsage,
} from "../materials";

const dec = (n: string | number) => new Prisma.Decimal(n);

/** A transaction client standing in for the one Prisma hands a callback. */
const tx = () => prismaMock as unknown as Prisma.TransactionClient;

const material = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  name: `Material ${id}`,
  unit: "gallon",
  costPrice: dec("4.00"),
  customerPrice: dec("9.00"),
  ...over,
});

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};

describe("parseMaterialUsage", () => {
  it("picks up positive quantities", () => {
    expect(parseMaterialUsage(form({ qty_m1: "2", qty_m2: "0.5" }))).toEqual([
      { materialId: "m1", qty: 2 },
      { materialId: "m2", qty: 0.5 },
    ]);
  });

  it("ignores the empty boxes the catalog form always submits", () => {
    // Every material gets an input, so most come back blank on every job.
    expect(parseMaterialUsage(form({ qty_m1: "", qty_m2: "3" }))).toEqual([
      { materialId: "m2", qty: 3 },
    ]);
  });

  it.each([
    ["0", "zero"],
    ["-2", "negative"],
    ["abc", "non-numeric"],
  ])("ignores a %s quantity (%s)", (value) => {
    expect(parseMaterialUsage(form({ qty_m1: value }))).toEqual([]);
  });

  it("ignores fields that aren't material quantities", () => {
    expect(parseMaterialUsage(form({ taskId: "t1", price: "50", note: "hi" }))).toEqual(
      []
    );
  });

  it("keeps a material id containing an underscore intact", () => {
    expect(parseMaterialUsage(form({ qty_m_1_x: "2" }))).toEqual([
      { materialId: "m_1_x", qty: 2 },
    ]);
  });

  it("returns nothing for an empty form", () => {
    expect(parseMaterialUsage(new FormData())).toEqual([]);
  });
});

describe("hasLoggedMaterials", () => {
  it("is false for a job that has never been closed out", async () => {
    prismaMock.stockMovement.count.mockResolvedValue(0);
    await expect(hasLoggedMaterials("t1")).resolves.toBe(false);
  });

  it("is true once usage has been recorded", async () => {
    prismaMock.stockMovement.count.mockResolvedValue(2);
    await expect(hasLoggedMaterials("t1")).resolves.toBe(true);
  });

  it("counts only this job's usage movements, not restocks", async () => {
    prismaMock.stockMovement.count.mockResolvedValue(0);
    await hasLoggedMaterials("t1");
    expect(prismaMock.stockMovement.count).toHaveBeenCalledWith({
      where: { taskId: "t1", type: "USAGE" },
    });
  });
});

describe("recordTaskMaterials", () => {
  const usage: MaterialUsage[] = [{ materialId: "m1", qty: 2 }];

  beforeEach(() => {
    prismaMock.material.findMany.mockResolvedValue([material("m1")]);
  });

  it("does nothing when no material was used", async () => {
    await recordTaskMaterials(tx(), "t1", []);
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.taskMaterial.create).not.toHaveBeenCalled();
    expect(prismaMock.stockMovement.create).not.toHaveBeenCalled();
  });

  it("itemises the material against the job", async () => {
    await recordTaskMaterials(tx(), "t1", usage);
    expect(prismaMock.taskMaterial.create.mock.calls[0][0].data).toEqual({
      taskId: "t1",
      materialId: "m1",
      quantityUsed: 2,
      costPriceAtTimeOfUse: dec("4.00"),
      customerPriceAtTimeOfUse: dec("9.00"),
    });
  });

  it("snapshots prices so a later change can't rewrite history", async () => {
    prismaMock.material.findMany.mockResolvedValue([
      material("m1", { costPrice: dec("4.00"), customerPrice: dec("9.00") }),
    ]);
    await recordTaskMaterials(tx(), "t1", usage);
    const row = prismaMock.taskMaterial.create.mock.calls[0][0].data;
    // The values are copied onto the row, not referenced by material id.
    expect(row.costPriceAtTimeOfUse).toEqual(dec("4.00"));
    expect(row.customerPriceAtTimeOfUse).toEqual(dec("9.00"));
  });

  it("takes the quantity off the shelf", async () => {
    await recordTaskMaterials(tx(), "t1", usage);
    expect(prismaMock.material.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { quantityOnHand: { decrement: 2 } },
    });
  });

  it("records a negative USAGE movement pointing back at the job", async () => {
    await recordTaskMaterials(tx(), "t1", usage);
    expect(prismaMock.stockMovement.create.mock.calls[0][0].data).toEqual({
      materialId: "m1",
      type: "USAGE",
      quantity: -2,
      taskId: "t1",
    });
  });

  it("handles several materials in one close-out", async () => {
    prismaMock.material.findMany.mockResolvedValue([material("m1"), material("m2")]);
    await recordTaskMaterials(tx(), "t1", [
      { materialId: "m1", qty: 2 },
      { materialId: "m2", qty: 1.5 },
    ]);
    expect(prismaMock.taskMaterial.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.material.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it("looks up only the materials actually used", async () => {
    await recordTaskMaterials(tx(), "t1", usage);
    expect(prismaMock.material.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
    });
  });

  it("skips an id with no material behind it rather than failing the job", async () => {
    // A stale form shouldn't block a close-out.
    prismaMock.material.findMany.mockResolvedValue([material("m1")]);
    await recordTaskMaterials(tx(), "t1", [
      { materialId: "m1", qty: 2 },
      { materialId: "gone", qty: 5 },
    ]);
    expect(prismaMock.taskMaterial.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(1);
  });

  it("writes a fractional quantity as given", async () => {
    await recordTaskMaterials(tx(), "t1", [{ materialId: "m1", qty: 0.25 }]);
    expect(prismaMock.taskMaterial.create.mock.calls[0][0].data.quantityUsed).toBe(0.25);
    expect(prismaMock.stockMovement.create.mock.calls[0][0].data.quantity).toBe(-0.25);
  });
});
