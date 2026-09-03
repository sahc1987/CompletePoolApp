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
  invoiceNumber,
  receiptNumber,
  paidAmount,
  recordPayment,
  resetBillPayments,
  type PaymentInput,
} from "../billing";

const dec = (n: string | number) => new Prisma.Decimal(n);

/** A bill of `total` with the given payments already against it. */
function seedBill(total: number, payments: { amount: number }[] = []) {
  prismaMock.bill.findUnique.mockResolvedValue({
    id: "b1",
    amount: dec(total),
    payments: payments.map((p, i) => ({ id: `p${i}`, amount: dec(p.amount) })),
    createdAt: new Date("2024-07-01T12:00:00Z"),
  });
}

const payment = (over: Partial<PaymentInput> = {}): PaymentInput => ({
  billId: "b1",
  amount: 50,
  method: "CASH",
  ...over,
});

/** The `data` of the payment.create queued inside $transaction. */
function createdPayment() {
  return prismaMock.payment.create.mock.calls[0][0].data;
}

/** The `data` of the bill.update queued inside $transaction. */
function billUpdate() {
  return prismaMock.bill.update.mock.calls[0][0].data;
}

describe("document numbers", () => {
  it("pads invoice numbers to six digits", () => {
    expect(invoiceNumber(1)).toBe("INV-000001");
    expect(invoiceNumber(1234)).toBe("INV-001234");
  });

  it("does not truncate a number that outgrows the padding", () => {
    expect(invoiceNumber(1234567)).toBe("INV-1234567");
  });

  it("pads receipt numbers the same way", () => {
    expect(receiptNumber(42)).toBe("RCP-000042");
  });
});

describe("paidAmount", () => {
  it("is zero for a bill with no payments", () => {
    expect(paidAmount([])).toBe(0);
  });

  it("sums Decimal and plain-number amounts alike", () => {
    expect(paidAmount([{ amount: dec("25.50") }, { amount: 10.25 }])).toBe(35.75);
  });

  it("rounds away floating-point crumbs", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in raw float math.
    expect(paidAmount([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });
});

describe("recordPayment", () => {
  it("rejects an unknown bill", async () => {
    prismaMock.bill.findUnique.mockResolvedValue(null);
    await expect(recordPayment(payment())).resolves.toEqual({
      error: "Bill not found",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a payment on a bill already settled", async () => {
    seedBill(100, [{ amount: 100 }]);
    const res = await recordPayment(payment({ amount: 10 }));
    expect(res.error).toMatch(/already paid in full/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, -5])("rejects a payment of %d", async (amount) => {
    seedBill(100);
    const res = await recordPayment(payment({ amount }));
    expect(res.error).toMatch(/more than \$0/);
  });

  it("rejects a payment above the outstanding balance", async () => {
    seedBill(100, [{ amount: 40 }]);
    const res = await recordPayment(payment({ amount: 75 }));
    expect(res.error).toBe("Payment can't exceed the $60.00 balance.");
  });

  it("allows a payment a hair over the balance (rounding slack)", async () => {
    // Half a cent of slack keeps float crumbs from blocking a legitimate payoff.
    seedBill(100, [{ amount: 40 }]);
    await expect(recordPayment(payment({ amount: 60.004 }))).resolves.toEqual({});
    expect(billUpdate().status).toBe("PAID");
  });

  it("treats a fully-rounded balance as settled", async () => {
    // 99.999 rounds to 100.00, so there is nothing left to collect.
    seedBill(100, [{ amount: 99.999 }]);
    const res = await recordPayment(payment({ amount: 0.01 }));
    expect(res.error).toMatch(/already paid in full/);
  });

  it("requires a check number for a check", async () => {
    seedBill(100);
    await expect(
      recordPayment(payment({ method: "CHECK", checkNumber: "  " }))
    ).resolves.toEqual({ error: "Enter the check number." });
  });

  it("requires a billing address for an online payment", async () => {
    seedBill(100);
    await expect(
      recordPayment(payment({ method: "ONLINE", billingAddress: "" }))
    ).resolves.toEqual({ error: "Enter the card billing address." });
  });

  it("marks the bill PARTIAL when a balance remains", async () => {
    seedBill(100);
    await expect(recordPayment(payment({ amount: 40 }))).resolves.toEqual({});
    expect(billUpdate()).toMatchObject({ status: "PARTIAL", paidAt: null });
  });

  it("marks the bill PAID once the balance is cleared", async () => {
    seedBill(100, [{ amount: 60 }]);
    await recordPayment(payment({ amount: 40 }));
    const update = billUpdate();
    expect(update.status).toBe("PAID");
    expect(update.paidAt).toBeInstanceOf(Date);
  });

  it("settles a bill paid in one go", async () => {
    seedBill(100);
    await recordPayment(payment({ amount: 100 }));
    expect(billUpdate().status).toBe("PAID");
  });

  it("settles despite a rounding crumb in the running total", async () => {
    seedBill(0.3, [{ amount: 0.1 }]);
    await recordPayment(payment({ amount: 0.2 }));
    expect(billUpdate().status).toBe("PAID");
  });

  it("stores the check number and clears the address for a check", async () => {
    seedBill(100);
    await recordPayment(
      payment({ method: "CHECK", checkNumber: " 1041 ", billingAddress: "ignored" })
    );
    expect(createdPayment()).toMatchObject({
      method: "CHECK",
      checkNumber: "1041",
      billingAddress: null,
    });
  });

  it("stores the address and clears the check number for an online payment", async () => {
    seedBill(100);
    await recordPayment(
      payment({ method: "ONLINE", billingAddress: " 5 Elm St ", checkNumber: "999" })
    );
    expect(createdPayment()).toMatchObject({
      method: "ONLINE",
      billingAddress: "5 Elm St",
      checkNumber: null,
    });
  });

  it("normalises a blank note to null and records who took the money", async () => {
    seedBill(100);
    await recordPayment(payment({ note: "   ", userId: "u7" }));
    expect(createdPayment()).toMatchObject({ note: null, recordedById: "u7" });
  });

  it("keeps a real note and leaves the recorder unset when unknown", async () => {
    seedBill(100);
    await recordPayment(payment({ note: " paid at the gate " }));
    expect(createdPayment()).toMatchObject({
      note: "paid at the gate",
      recordedById: null,
    });
  });

  it("writes the payment and the bill in one transaction", async () => {
    seedBill(100);
    await recordPayment(payment());
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(2);
  });
});

describe("resetBillPayments", () => {
  it("requires a reason", async () => {
    await expect(resetBillPayments("b1", "   ")).resolves.toEqual({
      error: "Enter a reason for undoing the payments.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown bill", async () => {
    prismaMock.bill.findUnique.mockResolvedValue(null);
    await expect(resetBillPayments("b1", "bounced check")).resolves.toEqual({
      error: "Bill not found",
    });
  });

  it("rejects a bill with nothing to undo", async () => {
    seedBill(100, []);
    const res = await resetBillPayments("b1", "bounced check");
    expect(res.error).toMatch(/no payments to undo/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("logs a reversal recording the amount, count, and trimmed reason", async () => {
    seedBill(100, [{ amount: 60 }, { amount: 40 }]);
    await expect(resetBillPayments("b1", "  bounced check  ", "u7")).resolves.toEqual({});
    expect(prismaMock.paymentReversal.create.mock.calls[0][0].data).toEqual({
      billId: "b1",
      reason: "bounced check",
      amountReversed: 100,
      paymentCount: 2,
      reversedById: "u7",
    });
  });

  it("deletes the payments and returns the bill to PENDING", async () => {
    seedBill(100, [{ amount: 100 }]);
    await resetBillPayments("b1", "bounced check");
    expect(prismaMock.payment.deleteMany).toHaveBeenCalledWith({
      where: { billId: "b1" },
    });
    expect(billUpdate()).toEqual({ status: "PENDING", method: null, paidAt: null });
  });

  it("does the reversal, deletion, and bill update atomically", async () => {
    seedBill(100, [{ amount: 100 }]);
    await resetBillPayments("b1", "bounced check");
    expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(3);
  });
});
