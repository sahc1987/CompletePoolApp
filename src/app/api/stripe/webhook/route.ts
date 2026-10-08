import { handleStripeWebhook } from "@/server/services/onlinePayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Stripe's notification that a customer's checkout completed. This, not the
 * customer's redirect back to the site, is what records an online payment.
 *
 * The signature is checked against the exact bytes Stripe sent, so the body is
 * read as text and never parsed before verification. Recording is idempotent,
 * so Stripe's retries are harmless.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const status = await handleStripeWebhook(raw, req.headers.get("stripe-signature"));
    return new Response(null, { status });
  } catch (e) {
    // A 500 makes Stripe retry later, which is right for a transient failure
    // (database unreachable) — the payment is recorded on a later attempt.
    console.error("[stripe webhook]", e);
    return new Response(null, { status: 500 });
  }
}
