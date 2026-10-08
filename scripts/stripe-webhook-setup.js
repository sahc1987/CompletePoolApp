#!/usr/bin/env node
/**
 * Create the Stripe webhook endpoint online payments rely on, and save its
 * signing secret into .env — without ever printing a secret.
 *
 *   node scripts/stripe-webhook-setup.js --url https://your-domain.com
 *   node scripts/stripe-webhook-setup.js --url https://your-domain.com --replace
 *   node scripts/stripe-webhook-setup.js --url https://your-domain.com --live
 *
 * Reads STRIPE_SECRET_KEY from .env. Refuses a live key unless --live is
 * given, so test setup can't touch the real account by accident. Stripe only
 * reveals a signing secret when the endpoint is created, so an endpoint that
 * already exists for the URL is left alone unless --replace is passed (which
 * deletes and recreates it — the old secret stops working).
 */
const fs = require("node:fs");
const path = require("node:path");
const Stripe = require("stripe");

const ENV_FILE = path.join(__dirname, "..", ".env");
const EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? "";
}
const flag = (name) => process.argv.includes(`--${name}`);

function readEnv(key) {
  const text = fs.readFileSync(ENV_FILE, "utf8");
  const m = text.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\r\\n]*)"?`, "m"));
  return m ? m[1].trim() : "";
}

function writeEnv(key, value) {
  let text = fs.readFileSync(ENV_FILE, "utf8");
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}\\s*=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "\n")}${line}\n`;
  fs.writeFileSync(ENV_FILE, text);
}

async function main() {
  const base = (arg("url") || "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/.test(base)) {
    throw new Error("Pass the production origin, e.g. --url https://your-domain.com (https, no path).");
  }

  const key = readEnv("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is empty in .env — paste your key there first.");
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && !flag("live")) {
    throw new Error("That's a LIVE key. Use a test key (sk_test_…) for setup, or pass --live on purpose.");
  }
  if (!live && !key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY doesn't look like a Stripe secret key.");
  }

  const stripe = new Stripe(key);
  const url = `${base}/api/stripe/webhook`;

  const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter(
    (e) => e.url === url
  );
  if (existing.length > 0) {
    if (!flag("replace")) {
      console.log(`An endpoint for ${url} already exists (${existing.map((e) => e.id).join(", ")}).`);
      console.log("Stripe only shows a signing secret once. Re-run with --replace to recreate it.");
      process.exitCode = 1;
      return;
    }
    for (const e of existing) await stripe.webhookEndpoints.del(e.id);
    console.log(`Removed ${existing.length} existing endpoint(s) for ${url}.`);
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    description: "Complete Pool Service — record online invoice payments",
  });
  if (!endpoint.secret) throw new Error("Stripe didn't return a signing secret.");

  writeEnv("STRIPE_WEBHOOK_SECRET", endpoint.secret);
  console.log(`${live ? "LIVE" : "Test"} webhook endpoint created: ${endpoint.id}`);
  console.log(`  URL:    ${url}`);
  console.log(`  Events: ${EVENTS.join(", ")}`);
  console.log("  Signing secret saved to .env as STRIPE_WEBHOOK_SECRET (not shown).");
}

main().catch((e) => {
  console.error(`Setup failed: ${e.message}`);
  process.exit(1);
});
