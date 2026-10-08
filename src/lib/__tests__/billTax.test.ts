/**
 * @jest-environment node
 */
import { Prisma } from "@prisma/client";
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;

import { billTaxes, createBillForTask, splitBillTax } from "../billing";

const dec = (n: string | number) => new Prisma.Decimal(n);

const STATE = { name: "State Sales Tax", ratePercent: 6 };
const COUNTY = { name: "County Tax", ratePercent: 1.5 };

describe("billTaxes", () => {
  it("applies each rate to the whole taxable amount, rounded to the cent", () => {
    expect(billTaxes(123.45, [STATE, COUNTY])).toEqual([
      { ...STATE, amount: 7.41 },
      { ...COUNTY, amount: 1.85 },
    ]);
  });

  it("is empty for a job with no estimate taxes", () => {
    expect(billTaxes(100, [])).toEqual([]);
  });
});

describe("splitBillTax", () => {
  it("leaves an untaxed bill alone", () => {
    expect(splitBillTax(250, [])).toEqual({ subtotal: 250, taxes: [] });
  });

  it("recovers the subtotal and tax rows a bill was created with", () => {
    const taxable = 123.45;
    const taxes = billTaxes(taxable, [STATE, COUNTY]);
    const total = Math.round((taxable + taxes[0].amount + taxes[1].amount) * 100) / 100;

    expect(splitBillTax(total, [STATE, COUNTY])).toEqual({ subtotal: taxable, taxes });
  });

  it("always prints rows that add up to the total", () => {
    // Amounts where per-rate rounding could leave a stray cent.
    for (const total of [0.01, 10.99, 101.07, 333.33, 1234.56, 9999.99]) {
      const { subtotal, taxes } = splitBillTax(total, [STATE, COUNTY]);
      const sum = subtotal + taxes.reduce((s, t) => s + t.amount, 0);
      expect(Math.round(sum * 100) / 100).toBe(total);
    }
  });
});

describe("createBillForTask", () => {
  const seedTask = (estimate: unknown) =>
    prismaMock.task.findUnique.mockResolvedValue({
      id: "t1",
      price: dec(200),
      extras: [{ priceAtTimeOfSale: dec(30) }],
      materials: [{ quantityUsed: dec(2), customerPriceAtTimeOfUse: dec(10) }],
      estimate,
    });

  beforeEach(() => {
    prismaMock.bill.findUnique.mockResolvedValue(null);
    prismaMock.bill.create.mockImplementation(async (args) => args.data);
  });

  it("bills service + extras + materials with no tax for an ordinary job", async () => {
    seedTask(null);
    await createBillForTask("t1");
    expect(prismaMock.bill.create.mock.calls[0][0].data.amount).toBe(250);
  });

  it("adds the signed estimate's taxes on the whole bill", async () => {
    seedTask({
      taxes: [
        { name: STATE.name, ratePercent: dec(6) },
        { name: COUNTY.name, ratePercent: dec(1.5) },
      ],
    });
    await createBillForTask("t1");
    // 250 taxable + 15.00 state + 3.75 county
    expect(prismaMock.bill.create.mock.calls[0][0].data.amount).toBe(268.75);
  });

  it("never re-bills a job that already has one", async () => {
    prismaMock.bill.findUnique.mockResolvedValue({ id: "b1" });
    await createBillForTask("t1");
    expect(prismaMock.bill.create).not.toHaveBeenCalled();
  });
});
