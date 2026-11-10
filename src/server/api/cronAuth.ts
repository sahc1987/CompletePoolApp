import { timingSafeEqual } from "node:crypto";

/**
 * Shared guard for the cron entry points.
 *
 * Both jobs mutate data and are reachable by anyone who knows the URL, so they
 * check the same shared secret the same way. Extracted because a second copy is
 * where one of them quietly stops checking.
 *
 * Vercel Cron sends the secret as `Authorization: Bearer <CRON_SECRET>`. The
 * secret is never accepted in the URL, where it would end up in access logs.
 *
 * With no secret set, the endpoints are open in development only. In
 * production they refuse every request, so a forgotten variable fails closed.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function cronRequestAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const auth = req.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${secret}`);
}
