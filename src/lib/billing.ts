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

/** A tax as the estimate snapshotted it when the customer signed. */
export type BillTaxRate = { name: string; ratePercent: number };
export type BillTaxLine = BillTaxRate & { amount: number };

/**
 * Tax on a bill, each rate applied to the whole taxable amount (service,
 * add-ons and materials) and rounded to the cent.
 *
 * Only jobs scheduled from a signed estimate are taxed, at that estimate's
 * rates — everything else passes an empty list and gets no tax.
 */
export function billTaxes(taxable: number, rates: BillTaxRate[]): BillTaxLine[] {
  return rates.map((r) => ({
    name: r.name,
    ratePercent: r.ratePercent,
    amount: round2((taxable * r.ratePercent) / 100),
  }));
}

/**
 * Split a stored bill total back into its pre-tax subtotal and tax rows, for
 * printing.
 *
 * A bill stores only its total, so the split is recovered from the rates. The
 * last tax row absorbs any rounding cent, keeping the invariant that matters on
 * a customer-facing document: subtotal + tax rows = the total printed under it.
 */
export function splitBillTax(
  billAmount: number,
  rates: BillTaxRate[]
): { subtotal: number; taxes: BillTaxLine[] } {
  if (rates.length === 0) return { subtotal: billAmount, taxes: [] };

  const totalRate = rates.reduce((s, r) => s + r.ratePercent, 0);
  const subtotal = round2(billAmount / (1 + totalRate / 100));
  const taxes = billTaxes(subtotal, rates);
  const drift = round2(billAmount - subtotal - taxes.reduce((s, t) => s + t.amount, 0));
  if (drift !== 0) {
    const last = taxes[taxes.length - 1];
    last.amount = round2(last.amount + drift);
  }
  return { subtotal, taxes };
}

export type PaymentInput = {
  billId: string;
  amount: number;
  method: "CASH" | "CHECK" | "ONLINE";
  checkNumber?: string | null;
  billingAddress?: string | null;
  note?: string | null;
  userId?: string;
  /**
   * Set when the money came in through Stripe. That money has already been
   * taken from the customer, so it is recorded even if it overpays the bill
   * (the office logged a cash payment while the customer was checking out) —
   * refusing it would make it vanish from the books. The overpayment is
   * reported back so someone can refund it.
   */
  stripePaymentIntentId?: string;
};

export type PaymentResult = {
  error?: string;
  /** Stripe already reported this payment; nothing was written. */
  duplicate?: boolean;
  /** How much a Stripe payment went over the balance, if it did. */
  overpaidBy?: number;
};

// Record money against a bill. Supports partial payments: the bill lands on
// PARTIAL until the balance reaches zero, then PAID.
export async function recordPayment(input: PaymentInput): Promise<PaymentResult> {
  const fromStripe = !!input.stripePaymentIntentId;
  if (fromStripe) {
    const seen = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: input.stripePaymentIntentId },
    });
    if (seen) return { duplicate: true };
  }

  const bill = await prisma.bill.findUnique({
    where: { id: input.billId },
    include: { payments: true },
  });
  if (!bill) return { error: "Bill not found" };

  const total = toNumber(bill.amount) ?? 0;
  const already = paidAmount(bill.payments);
  const balance = round2(total - already);

  if (!(input.amount > 0)) return { error: "Payment must be more than $0." };
  if (!fromStripe) {
    if (balance <= 0) return { error: "This bill is already paid in full." };
    if (input.amount - balance > EPS) {
      return { error: `Payment can't exceed the $${balance.toFixed(2)} balance.` };
    }
  }
  if (input.method === "CHECK" && !input.checkNumber?.trim()) {
    return { error: "Enter the check number." };
  }
  if (input.method === "ONLINE" && !input.billingAddress?.trim()) {
    return { error: "Enter the card billing address." };
  }

  const now = new Date();
  const settled = round2(already + input.amount) >= total - EPS;

  try {
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
          stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        },
      }),
      prisma.bill.update({
        where: { id: bill.id },
        data: {
          status: settled ? "PAID" : "PARTIAL",
          method: input.method,
          // An already-settled bill keeps the date it was settled.
          paidAt: settled ? bill.paidAt ?? now : null,
        },
      }),
    ]);
  } catch (e) {
    // Two reports of the same Stripe payment arriving at once: the unique
    // index let exactly one through.
    if (
      fromStripe &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { duplicate: true };
    }
    throw e;
  }

  const over = round2(input.amount - balance);
  return over > EPS ? { overpaidBy: over } : {};
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
// the customer, snapshotted at approval time — plus, for a job scheduled from a
// signed estimate, that estimate's taxes on the whole of it.
export async function createBillForTask(taskId: string) {
  const existing = await prisma.bill.findUnique({ where: { taskId } });
  if (existing) return existing;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      extras: true,
      materials: true,
      estimate: { include: { taxes: true } },
    },
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
  const taxable = round2((toNumber(task.price) ?? 0) + extras + materials);
  const tax = billTaxes(taxable, estimateTaxRates(task.estimate)).reduce(
    (s, t) => s + t.amount,
    0
  );
  const amount = round2(taxable + tax);

  return prisma.bill.create({ data: { taskId, amount, status: "PENDING" } });
}

/** The tax rates a job carries: its signed estimate's, or none. */
export function estimateTaxRates(
  estimate: { taxes: { name: string; ratePercent: Prisma.Decimal | number }[] } | null | undefined
): BillTaxRate[] {
  return (estimate?.taxes ?? []).map((t) => ({
    name: t.name,
    ratePercent: toNumber(t.ratePercent) ?? 0,
  }));
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
