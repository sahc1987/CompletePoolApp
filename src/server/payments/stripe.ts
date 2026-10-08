import Stripe from "stripe";

/**
 * The Stripe client, and the two settings online payments can't work without.
 *
 * Everything is read lazily: a deployment with no Stripe keys still builds and
 * runs, and simply doesn't offer online payment — the pay page says so and the
 * invoice prints no pay link.
 *
 *   STRIPE_SECRET_KEY      sk_test_… while testing, sk_live_… in production
 *   STRIPE_WEBHOOK_SECRET  whsec_… from the webhook endpoint (or `stripe listen`)
 *   APP_URL                public origin for pay links; falls back to NEXTAUTH_URL
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!appBaseUrl();
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

/** Where customers reach the app, without a trailing slash. */
export function appBaseUrl(): string | null {
  const url = process.env.APP_URL || process.env.NEXTAUTH_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

/** A bill's public pay link, or null while online payment isn't set up. */
export function payUrlFor(payToken: string): string | null {
  return stripeConfigured() ? `${appBaseUrl()}/pay/${payToken}` : null;
}

/** Dollars to the integer cents Stripe works in. */
export const toCents = (dollars: number) => Math.round(dollars * 100);
