/**
 * @jest-environment node
 */
import { Prisma } from "@prisma/client";
import { toNumber, money } from "../serialize";

describe("toNumber", () => {
  it("unwraps a Prisma Decimal", () => {
    expect(toNumber(new Prisma.Decimal("129.95"))).toBe(129.95);
  });

  it("passes a plain number through", () => {
    expect(toNumber(42.5)).toBe(42.5);
    expect(toNumber(0)).toBe(0);
  });

  it("maps null and undefined to null", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe("money", () => {
  it("formats a Decimal as USD", () => {
    expect(money(new Prisma.Decimal("129.5"))).toBe("$129.50");
  });

  it("formats a plain number as USD", () => {
    expect(money(1234.5)).toBe("$1,234.50");
  });

  it("formats zero rather than treating it as missing", () => {
    expect(money(0)).toBe("$0.00");
  });

  it("formats a negative amount", () => {
    expect(money(-25)).toBe("-$25.00");
  });

  it("shows an em dash when there is no amount", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
  });
});
