import { prisma } from "@/lib/prisma";
import {
  invoiceLineItems,
  paidAmount,
  type InvoiceLine,
} from "@/lib/billing";
import { assertRole, type Actor } from "@/server/actor";
import { requiredIso, requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";
import type {
  PaymentMethodValue,
  PaymentStatusValue,
} from "@/contracts/enums";

/**
 * The billing read model.
 *
 * The billing page derived all of this inline, which meant an invoice total on
 * a phone would have been a second implementation of "amount minus payments" —
 * the one number in this app nobody wants two versions of. Everything money-
 * shaped is computed here and handed out already serialized.
 */

export type BillPaymentRow = {
  id: string;
  receiptNo: number;
  amount: number;
  method: PaymentMethodValue;
  checkNumber: string | null;
  /** Card billing address, captured for ONLINE payments. */
  billingAddress: string | null;
  note: string | null;
  paidAt: string;
  recordedBy: string | null;
  /** What was still owed immediately after this payment landed. */
  balanceAfter: number;
};

export type BillReversalRow = {
  id: string;
  reason: string;
  amountReversed: number;
  paymentCount: number;
  reversedBy: string | null;
  createdAt: string;
};

export type BillRow = {
  id: string;
  invoiceNo: number;
  status: PaymentStatusValue;
  createdAt: string;
  /** Total owed for the job. */
  amount: number;
  /** Sum of payments received. */
  paid: number;
  /** `amount - paid`, rounded to cents. */
  balance: number;
  /** The job's price with each add-on and material itemised beneath it. */
  lineItems: InvoiceLine[];
  payments: BillPaymentRow[];
  reversals: BillReversalRow[];
  task: {
    id: string;
    /** Business-local midnight for the day the job was done. */
    date: string;
    serviceName: string;
    poolAddress: string;
    client: {
      id: string;
      name: string;
      /** Where the bill goes; may differ from the service location. */
      address: string | null;
      phone: string | null;
      email: string | null;
    };
  };
};

/** Everything the page and the API need, in one query. */
const billInclude = {
  payments: {
    orderBy: { paidAt: "asc" },
    include: { recordedBy: { select: { name: true } } },
  },
  reversals: {
    orderBy: { createdAt: "asc" },
    include: { reversedBy: { select: { name: true } } },
  },
  task: {
    include: {
      client: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          email: true,
        },
      },
      service: { select: { name: true } },
      pool: { select: { address: true } },
      extras: { include: { extraService: { select: { name: true } } } },
      materials: {
        include: { material: { select: { name: true, unit: true } } },
      },
    },
  },
} as const;

type BillWithRelations = Awaited<
  ReturnType<
    typeof prisma.bill.findMany<{ include: typeof billInclude }>
  >
>[number];

function toRow(b: BillWithRelations): BillRow {
  const amount = requiredMoney(b.amount);
  const paid = paidAmount(b.payments);
  const balance = Math.round((amount - paid) * 100) / 100;

  // Receipts show the balance *after* their own payment, so walk the payments
  // in order and carry a running total.
  let running = 0;
  const payments = b.payments.map((p) => {
    const amt = requiredMoney(p.amount);
    running = Math.round((running + amt) * 100) / 100;
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      amount: amt,
      method: p.method as PaymentMethodValue,
      checkNumber: p.checkNumber,
      billingAddress: p.billingAddress,
      note: p.note,
      paidAt: requiredIso(p.paidAt),
      recordedBy: p.recordedBy?.name ?? null,
      balanceAfter: Math.round((amount - running) * 100) / 100,
    };
  });

  return {
    id: b.id,
    invoiceNo: b.invoiceNo,
    status: b.status as PaymentStatusValue,
    createdAt: requiredIso(b.createdAt),
    amount,
    paid,
    balance,
    lineItems: invoiceLineItems({
      billAmount: amount,
      serviceName: b.task.service.name,
      extras: b.task.extras.map((e) => ({
        name: e.extraService.name,
        price: requiredMoney(e.priceAtTimeOfSale),
      })),
      materials: b.task.materials.map((m) => ({
        name: m.material.name,
        unit: m.material.unit,
        quantity: requiredMoney(m.quantityUsed),
        unitPrice: requiredMoney(m.customerPriceAtTimeOfUse),
      })),
    }),
    payments,
    reversals: b.reversals.map((r) => ({
      id: r.id,
      reason: r.reason,
      amountReversed: requiredMoney(r.amountReversed),
      paymentCount: r.paymentCount,
      reversedBy: r.reversedBy?.name ?? null,
      createdAt: requiredIso(r.createdAt),
    })),
    task: {
      id: b.task.id,
      date: requiredIso(b.task.date),
      serviceName: b.task.service.name,
      poolAddress: b.task.pool.address,
      client: {
        id: b.task.client.id,
        name: b.task.client.name,
        address: b.task.client.address,
        phone: b.task.client.phone,
        email: b.task.client.email,
      },
    },
  };
}

/**
 * Every bill, newest first.
 *
 * Filtering by date range, status and pagination happen above this — the
 * billing page does it against the URL, and the API will do it against query
 * parameters — because both need the unfiltered set to count the tabs.
 */
export async function listBills(
  actor: Actor
): Promise<ServiceResult<BillRow[]>> {
  const denied = assertRole(actor, "ADMIN", "OWNER");
  if (denied) return denied;

  const bills = await prisma.bill.findMany({
    include: billInclude,
    orderBy: { createdAt: "desc" },
  });
  return ok(bills.map(toRow));
}

/** One bill, for an invoice document or a detail screen. */
export async function getBill(
  actor: Actor,
  billId: string
): Promise<ServiceResult<BillRow | null>> {
  const denied = assertRole(actor, "ADMIN", "OWNER");
  if (denied) return denied;

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: billInclude,
  });
  return ok(bill ? toRow(bill) : null);
}
