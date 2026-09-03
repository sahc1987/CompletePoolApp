import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber } from "./serialize";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Customer-facing document numbers, padded so they sort and read consistently.
export const invoiceNumber = (n: number) => `INV-${String(n).padStart(6, "0")}`;
export const receiptNumber = (n: number) => `RCP-${String(n).padStart(6, "0")}`;
// Money comparisons need a cent of slack so float math doesn't leave a bill
// stuck at "partial" over a rounding crumb.
const EPS = 0.005;

// How much has actually been collected against a bill.
export function paidAmount(payments: { amount: Prisma.Decimal | number }[]) {
  return round2(payments.reduce((s, p) => s + (toNumber(p.amount) ?? 0), 0));
}

/** One printed row on an invoice. `detail` is the smaller line beneath it. */
export type InvoiceLine = {
  description: string;
  detail?: string;
  amount: number;
};

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * The rows printed on an invoice: the service, then each add-on, then each
 * material the job consumed.
 *
 * A bill's amount is service + add-ons + materials, snapshotted at approval.
 * The service line is derived by subtracting the itemised parts from that
 * stored total rather than read from `task.price`, because the two can drift —
 * editing a job's price after it has been billed leaves the snapshot behind.
 * Deriving it keeps the invariant that actually matters on a customer-facing
 * document: **the rows sum to the total printed underneath them.**
 *
 * Materials were previously left out entirely, which silently folded their
 * cost into the service line — the customer saw a service priced above what
 * they agreed, with nothing explaining the difference.
 */
export function invoiceLineItems(input: {
  /** The bill's stored total. */
  billAmount: number;
  serviceName: string;
  extras: { name: string; price: number }[];
  materials: { name: string; unit: string; quantity: number; unitPrice: number }[];
}): InvoiceLine[] {
  const extras: InvoiceLine[] = input.extras.map((e) => ({
    description: e.name,
    amount: round2(e.price),
  }));

  const materials: InvoiceLine[] = input.materials.map((m) => ({
    description: m.name,
    // Spelled out so the amount is checkable rather than asserted.
    detail: `${m.quantity} ${m.unit} × ${usd(m.unitPrice)}`,
    amount: round2(m.quantity * m.unitPrice),
  }));

  const itemised = [...extras, ...materials].reduce((s, li) => s + li.amount, 0);
  const service = round2(input.billAmount - itemised);

  return [{ description: input.serviceName, amount: service }, ...extras, ...materials];
}

export type PaymentInput = {
  billId: string;
  amount: number;
  method: "CASH" | "CHECK" | "ONLINE";
  checkNumber?: string | null;
  billingAddress?: string | null;
  note?: string | null;
  userId?: string;
};

// Record money against a bill. Supports partial payments: the bill lands on
// PARTIAL until the balance reaches zero, then PAID.
export async function recordPayment(input: PaymentInput): Promise<{ error?: string }> {
  const bill = await prisma.bill.findUnique({
    where: { id: input.billId },
    include: { payments: true },
  });
  if (!bill) return { error: "Bill not found" };

  const total = toNumber(bill.amount) ?? 0;
  const already = paidAmount(bill.payments);
  const balance = round2(total - already);

  if (balance <= 0) return { error: "This bill is already paid in full." };
  if (!(input.amount > 0)) return { error: "Payment must be more than $0." };
  if (input.amount - balance > EPS) {
    return { error: `Payment can't exceed the $${balance.toFixed(2)} balance.` };
  }
  if (input.method === "CHECK" && !input.checkNumber?.trim()) {
    return { error: "Enter the check number." };
  }
  if (input.method === "ONLINE" && !input.billingAddress?.trim()) {
    return { error: "Enter the card billing address." };
  }

  const now = new Date();
  const settled = round2(already + input.amount) >= total - EPS;

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        billId: bill.id,
        amount: input.amount,
        method: input.method,
        checkNumber: input.method === "CHECK" ? input.checkNumber!.trim() : null,
        billingAddress: input.method === "ONLINE" ? input.billingAddress!.trim() : null,
        note: input.note?.trim() || null,
        paidAt: now,
        recordedById: input.userId ?? null,
      },
    }),
    prisma.bill.update({
      where: { id: bill.id },
      data: {
        status: settled ? "PAID" : "PARTIAL",
        method: input.method,
        paidAt: settled ? now : null,
      },
    }),
  ]);
  return {};
}

// Bills settled before the Payment table existed carry status=PAID but have
// no payment rows, so the derived "paid" would read $0 and they'd look like
// they still owe money. Give each one a single payment for its full amount.
// Idempotent: only touches PAID bills with no payments.
export async function backfillLegacyPayments() {
  const legacy = await prisma.bill.findMany({
    where: { status: "PAID", payments: { none: {} } },
  });
  for (const b of legacy) {
    await prisma.payment.create({
      data: {
        billId: b.id,
        amount: b.amount,
        method: b.method ?? "CASH",
        paidAt: b.paidAt ?? b.createdAt,
        note: "Recorded before itemised payments existed",
      },
    });
  }
}

// Wipe all payments on a bill and put it back to PENDING (correction, e.g. a
// bounced check). The reason is required and logged as a PaymentReversal so
// there's a standing record of why the money came back off, since the payment
// rows themselves are deleted.
export async function resetBillPayments(
  billId: string,
  reason: string,
  userId?: string
): Promise<{ error?: string }> {
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Enter a reason for undoing the payments." };

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { payments: true },
  });
  if (!bill) return { error: "Bill not found" };
  if (bill.payments.length === 0) {
    return { error: "This bill has no payments to undo." };
  }

  const amountReversed = paidAmount(bill.payments);

  await prisma.$transaction([
    prisma.paymentReversal.create({
      data: {
        billId,
        reason: trimmed,
        amountReversed,
        paymentCount: bill.payments.length,
        reversedById: userId ?? null,
      },
    }),
    prisma.payment.deleteMany({ where: { billId } }),
    prisma.bill.update({
      where: { id: billId },
      data: { status: "PENDING", method: null, paidAt: null },
    }),
  ]);
  return {};
}

// A finished job's bill amount = service price + extras + materials billed to
// the customer, snapshotted at approval time.
export async function createBillForTask(taskId: string) {
  const existing = await prisma.bill.findUnique({ where: { taskId } });
  if (existing) return existing;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { extras: true, materials: true },
  });
  if (!task) return null;

  const extras = task.extras.reduce(
    (s, e) => s + (toNumber(e.priceAtTimeOfSale) ?? 0),
    0
  );
  const materials = task.materials.reduce(
    (s, m) =>
      s + (toNumber(m.quantityUsed) ?? 0) * (toNumber(m.customerPriceAtTimeOfUse) ?? 0),
    0
  );
  const amount = (toNumber(task.price) ?? 0) + extras + materials;

  return prisma.bill.create({ data: { taskId, amount, status: "PENDING" } });
}

// Create bills for any APPROVED job that doesn't have one yet (e.g. jobs
// approved before billing existed). Idempotent; safe to call on page load.
export async function backfillBills() {
  const tasks = await prisma.task.findMany({
    where: { status: "APPROVED", bill: { is: null } },
    select: { id: true },
  });
  for (const t of tasks) {
    await createBillForTask(t.id);
  }
}
