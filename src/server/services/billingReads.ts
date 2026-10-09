import { prisma } from "@/lib/prisma";
import {
  estimateTaxRates,
  invoiceLineItems,
  paidAmount,
  splitBillTax,
  type BillTaxLine,
  type InvoiceLine,
} from "@/lib/billing";
import { getBusinessTimezone } from "@/lib/schedule";
import { resolveBillPeriod, scopeBill, type BillRange } from "@/lib/billingPeriod";
import { assertRole, type Actor } from "@/server/actor";
import { payUrlFor } from "@/server/payments/stripe";
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
  /** Line items summed, before tax. Equals `amount` on an untaxed bill. */
  subtotal: number;
  /** Only on jobs scheduled from a signed estimate, at that estimate's rates. */
  taxes: BillTaxLine[];
  /**
   * The customer's online pay link, while something is owed and online payment
   * is set up; null otherwise.
   */
  payUrl: string | null;
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
      estimate: { select: { taxes: { select: { name: true, ratePercent: true } } } },
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
  const { subtotal, taxes } = splitBillTax(amount, estimateTaxRates(b.task.estimate));

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
    subtotal,
    taxes,
    payUrl: balance > 0 ? payUrlFor(b.payToken) : null,
    lineItems: invoiceLineItems({
      // The rows sum to the pre-tax subtotal; tax prints beneath them.
      billAmount: subtotal,
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

export type BillStatusFilter = "all" | "pending" | "partial" | "paid" | "open";

/** A bill as listed for a period: `paid` stays all-time, and this is the slice of it. */
export type BillListRow = BillRow & { paidInPeriod: number };

export type BillListPage = {
  rows: BillListRow[];
  /** Per tab, within the client filter and period, so the tabs can show their sizes. */
  counts: Record<BillStatusFilter, number>;
  /**
   * The web's three period figures: billed counts jobs dated in the period,
   * collected counts payments received in it, outstanding is the real balance
   * still owed on these bills. With no period, they're all-time.
   */
  totals: { billed: number; collected: number; outstanding: number };
  page: number;
  perPage: number;
  totalPages: number;
  /** Rows matching the tab — what the pages divide up. */
  total: number;
  /** The business's zone, so a phone shows dates as the business counts them. */
  timezone: string;
  /**
   * The period as resolved in that zone, with the day keys for stepping a day
   * either side — so the app never does date arithmetic of its own.
   */
  period: {
    range: BillRange;
    label: string | null;
    todayValue: string;
    dayValue: string;
    prevDay: string;
    nextDay: string;
  };
};

const matchesStatus = (b: BillRow, status: BillStatusFilter) =>
  status === "all"
    ? true
    : status === "open"
      ? b.balance > 0
      : b.status.toLowerCase() === status;

/**
 * One page of bills for the API, newest first: an optional client, an
 * optional period (the web's ranges, via lib/billingPeriod), and a status tab
 * ("open" is anything with a balance — pending and partial together, which is
 * the list a person collecting money actually wants).
 */
export async function listBillsPage(
  actor: Actor,
  opts: {
    status?: BillStatusFilter;
    clientId?: string;
    page?: number;
    perPage?: number;
    range?: string | null;
    from?: string | null;
    to?: string | null;
  } = {}
): Promise<ServiceResult<BillListPage>> {
  const [all, timezone] = await Promise.all([listBills(actor), getBusinessTimezone()]);
  if (!all.ok) return all;

  const period = resolveBillPeriod(opts, timezone);
  const scoped = all.data
    .filter((b) => !opts.clientId || b.task.client.id === opts.clientId)
    .flatMap((b) => {
      const cut = scopeBill(b, period);
      return cut.touches ? [{ ...b, paidInPeriod: cut.paidInPeriod, billedInPeriod: cut.billedInPeriod }] : [];
    });
  const status = opts.status ?? "all";
  const matching = scoped.filter((b) => matchesStatus(b, status));

  const round = (n: number) => Math.round(n * 100) / 100;
  const counts = Object.fromEntries(
    (["all", "pending", "partial", "paid", "open"] as const).map((k) => [
      k,
      scoped.filter((b) => matchesStatus(b, k)).length,
    ])
  ) as Record<BillStatusFilter, number>;

  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 25));
  const totalPages = Math.max(1, Math.ceil(matching.length / perPage));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  return ok({
    rows: matching
      .slice((page - 1) * perPage, page * perPage)
      .map(({ billedInPeriod: _billed, ...row }) => row),
    counts,
    totals: {
      billed: round(scoped.reduce((s, b) => s + (b.billedInPeriod ? b.amount : 0), 0)),
      collected: round(scoped.reduce((s, b) => s + b.paidInPeriod, 0)),
      outstanding: round(scoped.reduce((s, b) => s + Math.max(0, b.balance), 0)),
    },
    page,
    perPage,
    totalPages,
    total: matching.length,
    timezone,
    period: {
      range: period.range,
      label: period.label,
      todayValue: period.todayValue,
      dayValue: period.dayValue,
      prevDay: period.prevDay,
      nextDay: period.nextDay,
    },
  });
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
