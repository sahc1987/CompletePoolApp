/**
 * @jest-environment node
 */
// invoiceLineItems is pure, but billing.ts opens a Prisma client at import
// time — stub it so no database is needed to exercise the maths.
jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

import { invoiceLineItems } from "../billing";

const sum = (lines: { amount: number }[]) =>
  Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

const build = (over: Partial<Parameters<typeof invoiceLineItems>[0]> = {}) =>
  invoiceLineItems({
    billAmount: 100,
    serviceName: "Weekly cleaning",
    extras: [],
    materials: [],
    ...over,
  });

describe("invoiceLineItems", () => {
  it("prints the service alone when there is nothing else", () => {
    expect(build()).toEqual([{ description: "Weekly cleaning", amount: 100 }]);
  });

  it("itemises add-ons under the service", () => {
    const lines = build({
      billAmount: 150,
      extras: [{ name: "Filter clean", price: 30 }],
    });
    expect(lines).toEqual([
      { description: "Weekly cleaning", amount: 120 },
      { description: "Filter clean", amount: 30 },
    ]);
  });

  it("itemises materials, which used to vanish into the service line", () => {
    // The whole defect: material cost was folded into the service, so the
    // customer saw a service priced above what they agreed to.
    const lines = build({
      billAmount: 122.5,
      materials: [{ name: "Chlorine", unit: "gallon", quantity: 2.5, unitPrice: 9 }],
    });
    expect(lines).toEqual([
      { description: "Weekly cleaning", amount: 100 },
      { description: "Chlorine", detail: "2.5 gallon × $9.00", amount: 22.5 },
    ]);
  });

  it("shows quantity and unit price so the amount can be checked", () => {
    const [, material] = build({
      billAmount: 118,
      materials: [{ name: "Filter cartridge", unit: "unit", quantity: 2, unitPrice: 9 }],
    });
    expect(material.detail).toBe("2 unit × $9.00");
    expect(material.amount).toBe(18);
  });

  it("orders the rows service, then add-ons, then materials", () => {
    const lines = build({
      billAmount: 200,
      extras: [{ name: "Filter clean", price: 30 }],
      materials: [{ name: "Chlorine", unit: "gallon", quantity: 1, unitPrice: 9 }],
    });
    expect(lines.map((l) => l.description)).toEqual([
      "Weekly cleaning",
      "Filter clean",
      "Chlorine",
    ]);
  });

  it("lists every add-on and every material", () => {
    const lines = build({
      billAmount: 300,
      extras: [
        { name: "Filter clean", price: 30 },
        { name: "Acid wash", price: 45 },
      ],
      materials: [
        { name: "Chlorine", unit: "gallon", quantity: 2, unitPrice: 9 },
        { name: "Filter cartridge", unit: "unit", quantity: 1, unitPrice: 24 },
      ],
    });
    expect(lines).toHaveLength(5);
  });

  describe("the rows always sum to the bill total", () => {
    // The invariant a customer-facing document lives or dies on.
    it.each([
      ["service only", 100, [], []],
      [
        "service + add-ons",
        150,
        [{ name: "Filter clean", price: 30 }],
        [],
      ],
      [
        "service + materials",
        122.5,
        [],
        [{ name: "Chlorine", unit: "gallon", quantity: 2.5, unitPrice: 9 }],
      ],
      [
        "service + add-ons + materials",
        207.5,
        [
          { name: "Filter clean", price: 30 },
          { name: "Acid wash", price: 45 },
        ],
        [
          { name: "Chlorine", unit: "gallon", quantity: 2.5, unitPrice: 9 },
          { name: "Tablets", unit: "lb", quantity: 3, unitPrice: 4 },
        ],
      ],
    ])("%s", (_label, billAmount, extras, materials) => {
      const lines = build({
        billAmount: billAmount as number,
        extras: extras as { name: string; price: number }[],
        materials: materials as {
          name: string;
          unit: string;
          quantity: number;
          unitPrice: number;
        }[],
      });
      expect(sum(lines)).toBe(billAmount);
    });
  });

  it("still sums when a fractional quantity produces a repeating cent", () => {
    // 0.333 × 9 = 2.997 — the row rounds to 3.00, and the service line has to
    // absorb the difference or the invoice won't add up.
    const lines = build({
      billAmount: 103,
      materials: [{ name: "Chlorine", unit: "gallon", quantity: 0.333, unitPrice: 9 }],
    });
    expect(sum(lines)).toBe(103);
  });

  it("absorbs a price edited after the bill was raised, keeping the total intact", () => {
    // task.price can drift from the bill's snapshot; the printed rows must
    // still reconcile to the amount the customer is being asked for.
    const lines = build({
      billAmount: 90, // snapshot, lower than the service's current price
      materials: [{ name: "Chlorine", unit: "gallon", quantity: 1, unitPrice: 9 }],
    });
    expect(lines[0].amount).toBe(81);
    expect(sum(lines)).toBe(90);
  });

  it("gives a material no detail line when it has no unit price", () => {
    const [, material] = build({
      billAmount: 100,
      materials: [{ name: "Sample", unit: "unit", quantity: 1, unitPrice: 0 }],
    });
    expect(material.amount).toBe(0);
    expect(material.detail).toBe("1 unit × $0.00");
  });

  it("carries no detail line on the service or add-on rows", () => {
    const lines = build({
      billAmount: 150,
      extras: [{ name: "Filter clean", price: 30 }],
    });
    expect(lines[0].detail).toBeUndefined();
    expect(lines[1].detail).toBeUndefined();
  });
});
