import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  estimateTaxRates,
  invoiceLineItems,
  invoiceNumber,
  paidAmount,
  recordPayment,
  splitBillTax,
  type BillTaxLine,
  type InvoiceLine,
} from "@/lib/billing";
import { getCompanyInfo } from "@/lib/company";
import { notifyRoles } from "@/lib/notify";
import { getBusinessTimezone } from "@/lib/schedule";
import { requiredMoney } from "@/server/serialize";
import { badState, notFound, ok, type ServiceResult } from "@/server/result";
import {
  appBaseUrl,
  getStripe,
  stripeConfigured,
  toCents,
  webhookSecret,
} from "@/server/payments/stripe";

/**
 * Customers paying their own invoice by card, through Stripe Checkout.
 *
 * There is no actor here: the customer has no account. What authorizes them
 * is the bill's `payToken` — a random secret that only travels in the pay link
 * printed on their invoice. Anyone holding the link may see that one invoice
 * and pay it; nothing else is reachable from it.
 *
 * Rules, as decided:
 *  - Cards and card wallets (Apple Pay, Google Pay) only.
 *  - Always the full outstanding balance — no partial online payments.
 *  - The business absorbs Stripe's fee; the customer pays the balance exactly.
 *  - Stripe is the source of truth: a payment is recorded only from a
 *    completed, paid Checkout Session, never from the customer landing on the
 *    success page.
 */

export type PublicInvoice = {
  invoiceNo: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  clientName: string;
  serviceName: string;
  /** The day the job was done, e.g. "Oct 6, 2026", in the business's zone. */
  jobDate: string;
  lineItems: InvoiceLine[];
  subtotal: number;
  taxes: BillTaxLine[];
  total: number;
  paid: number;
  balance: number;
  /** False when this deployment has no Stripe keys. */
  canPayOnline: boolean;
};

async function loadBillByToken(token: string) {
  // Tokens are 32 hex characters; anything else can't match, so don't query.
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return prisma.bill.findUnique({
    where: { payToken: token },
    include: {
      payments: true,
      task: {
        include: {
          client: { select: { name: true } },
          service: { select: { name: true } },
          extras: { include: { extraService: { select: { name: true } } } },
          materials: { include: { material: { select: { name: true, unit: true } } } },
          estimate: { select: { taxes: { select: { name: true, ratePercent: true } } } },
        },
      },
    },
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The invoice behind a pay link, or null for a link that matches nothing. */
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const bill = await loadBillByToken(token);
  if (!bill) return null;

  const company = await getCompanyInfo();
  const total = requiredMoney(bill.amount);
  const paid = paidAmount(bill.payments);
  const { subtotal, taxes } = splitBillTax(total, estimateTaxRates(bill.task.estimate));

  return {
    invoiceNo: invoiceNumber(bill.invoiceNo),
    companyName: company.name,
    companyPhone: company.phone ?? null,
    companyEmail: company.email ?? null,
    clientName: bill.task.client.name,
    serviceName: bill.task.service.name,
    jobDate: bill.task.date.toLocaleDateString("en-US", {
      timeZone: await getBusinessTimezone(),
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    lineItems: invoiceLineItems({
      billAmount: subtotal,
      serviceName: bill.task.service.name,
      extras: bill.task.extras.map((e) => ({
        name: e.extraService.name,
        price: requiredMoney(e.priceAtTimeOfSale),
      })),
      materials: bill.task.materials.map((m) => ({
        name: m.material.name,
        unit: m.material.unit,
        quantity: requiredMoney(m.quantityUsed),
        unitPrice: requiredMoney(m.customerPriceAtTimeOfUse),
      })),
    }),
    subtotal,
    taxes,
    total,
    paid,
    balance: Math.max(0, round2(total - paid)),
    canPayOnline: stripeConfigured(),
  };
}

/**
 * Open a Stripe Checkout for the bill's whole outstanding balance and return
 * the URL to send the customer to.
 */
export async function startCheckout(
  token: string
): Promise<ServiceResult<{ url: string }>> {
  if (!stripeConfigured()) {
    return badState("Online payment isn't available right now. Please contact our office.");
  }

  const bill = await loadBillByToken(token);
  if (!bill) return notFound("This payment link isn't valid.");

  const balance = round2(requiredMoney(bill.amount) - paidAmount(bill.payments));
  if (balance <= 0) return badState("This invoice is already paid in full.");

  const cents = toCents(balance);
  const stripe = getStripe();

  // Guard 1 against paying twice: one live checkout per bill. A second tap, a
  // second tab or a reload lands on the same session, and a session can only
  // be paid once.
  if (bill.checkoutSessionId) {
    let existing: Stripe.Checkout.Session | null = null;
    try {
      existing = await stripe.checkout.sessions.retrieve(bill.checkoutSessionId);
    } catch {
      existing = null; // gone on Stripe's side; start a fresh one below
    }
    if (existing?.status === "complete") {
      // Paid, but the webhook hasn't landed yet — record it now (idempotent).
      await recordCheckoutSession(existing);
      return badState("This invoice has already been paid online.");
    }
    if (existing?.status === "open") {
      if (existing.amount_total === cents && existing.url) return ok({ url: existing.url });
      // The balance changed since it was opened (a payment was recorded in the
      // office). Close it so the old amount can't be paid as well.
      try {
        await stripe.checkout.sessions.expire(existing.id);
      } catch {
        // Completed or expired in the meantime; the new session replaces it.
      }
    }
  }

  const company = await getCompanyInfo();
  const invoiceNo = invoiceNumber(bill.invoiceNo);
  const base = appBaseUrl();

  // Guard 2: two taps that both get past the check above at the same moment
  // send the same idempotency key, and Stripe answers both with one session.
  // The key changes whenever the situation does (new balance, a payment
  // recorded, the previous session replaced), so a legitimate new checkout is
  // never blocked by an old one.
  const idempotencyKey = [
    "checkout",
    bill.id,
    cents,
    bill.payments.length,
    bill.checkoutSessionId ?? "first",
  ].join(":");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Cards only; Apple Pay and Google Pay are card wallets, so they're offered
    // automatically where the customer's device supports them.
    allowed_payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: toCents(balance),
          product_data: {
            name: `Invoice ${invoiceNo}`,
            description: `${bill.task.service.name} — ${company.name}`,
          },
        },
      },
    ],
    // Recorded on the payment, as a manually entered card payment would be.
    billing_address_collection: "required",
    submit_type: "pay",
    client_reference_id: bill.id,
    metadata: { billId: bill.id, invoiceNo },
    payment_intent_data: {
      metadata: { billId: bill.id, invoiceNo },
      description: `Invoice ${invoiceNo}`,
    },
    success_url: `${base}/pay/${token}/done?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pay/${token}`,
  }, { idempotencyKey });

  if (session.status !== "open" || !session.url) {
    return badState("Couldn't start the payment. Please try again.");
  }
  await prisma.bill.update({
    where: { id: bill.id },
    data: { checkoutSessionId: session.id },
  });
  return ok({ url: session.url });
}

/**
 * Guard 3: when the office records a payment by hand, close any checkout the
 * customer still has open, so they can't go on to pay the amount that was
 * owed before. Best effort — if Stripe can't be reached the overpayment
 * check in `recordPayment` still catches a payment that slips through.
 */
export async function expireOpenCheckout(billId: string): Promise<void> {
  if (!stripeConfigured()) return;
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: { checkoutSessionId: true },
  });
  if (!bill?.checkoutSessionId) return;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(bill.checkoutSessionId);
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
  } catch {
    // Already expired or unreachable; see above.
  }
}

function formatAddress(a: Stripe.Address | null | undefined): string {
  if (!a) return "Collected by Stripe";
  const cityLine = [a.city, [a.state, a.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [a.line1, a.line2, cityLine, a.country].filter(Boolean).join(", ") || "Collected by Stripe";
}

export type RecordOutcome =
  | "recorded"
  | "duplicate"
  | "not_paid"
  | "unknown_bill";

/**
 * Record the payment a completed Checkout Session represents. Safe to call
 * any number of times for the same session — the webhook and the customer's
 * return page both do, and whichever arrives second writes nothing.
 */
export async function recordCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<RecordOutcome> {
  if (session.payment_status !== "paid") return "not_paid";

  const billId = session.client_reference_id ?? session.metadata?.billId;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!billId || !paymentIntentId || session.amount_total == null) return "unknown_bill";

  const amount = session.amount_total / 100;
  const res = await recordPayment({
    billId,
    amount,
    method: "ONLINE",
    billingAddress: formatAddress(session.customer_details?.address),
    note: "Paid online by card (Stripe)",
    stripePaymentIntentId: paymentIntentId,
  });
  if (res.duplicate) return "duplicate";
  if (res.error) {
    // The money is in Stripe either way; make sure a person looks at it.
    await notifyRoles(
      ["ADMIN"],
      `A Stripe payment of $${amount.toFixed(2)} couldn't be recorded (${res.error}). Check Stripe payment ${paymentIntentId}.`,
      { link: "/billing" }
    );
    return "unknown_bill";
  }

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: { invoiceNo: true, task: { select: { client: { select: { name: true } } } } },
  });
  const who = bill?.task.client.name ?? "A customer";
  const inv = bill ? invoiceNumber(bill.invoiceNo) : "an invoice";
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${who} paid $${amount.toFixed(2)} online for ${inv}.`,
    { link: "/billing" }
  );
  if (res.overpaidBy) {
    await notifyRoles(
      ["ADMIN"],
      `${inv} was overpaid by $${res.overpaidBy.toFixed(2)} — a payment was recorded while ${who} was paying online. Refund the difference in Stripe.`,
      { link: "/billing" }
    );
  }
  return "recorded";
}

/**
 * The customer's return from Checkout. Looks the session up with Stripe rather
 * than trusting the URL, records it if the webhook hasn't yet, and reports
 * whether the money is in.
 */
export async function confirmReturn(
  token: string,
  sessionId: string
): Promise<"paid" | "processing" | "invalid"> {
  if (!stripeConfigured() || !sessionId.startsWith("cs_")) return "invalid";
  const bill = await loadBillByToken(token);
  if (!bill) return "invalid";

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch {
    return "invalid";
  }
  // A session id from someone else's checkout must not mark this bill paid.
  if (session.client_reference_id !== bill.id) return "invalid";

  const outcome = await recordCheckoutSession(session);
  return outcome === "recorded" || outcome === "duplicate" ? "paid" : "processing";
}

/**
 * A Stripe webhook delivery. Verifies the signature against the raw body, then
 * records completed payments. Returns the HTTP status to answer with: Stripe
 * retries anything that isn't 2xx, which is what we want for a transient
 * failure and not for a forged request.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null
): Promise<number> {
  const secret = webhookSecret();
  if (!secret || !signature || !process.env.STRIPE_SECRET_KEY) return 400;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return 400;
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await recordCheckoutSession(event.data.object);
      return 200;
    default:
      // Subscribed to more than we handle, or a new event type: acknowledge.
      return 200;
  }
}
