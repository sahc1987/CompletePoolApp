import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/loginThrottle";
import { apiError } from "./respond";
import type { NextResponse } from "next/server";

/**
 * A fixed-window request limiter for the auth endpoints.
 *
 * This is not the sign-in lockout — `lib/loginThrottle.ts` still counts failed
 * sign-ins by address and by source, and remains the real limit on guessing a
 * password. This counts *requests*, which covers what that can't: hammering
 * `/auth/refresh` with garbage never touches the login counters, and a token
 * endpoint that will happily be called ten thousand times a minute is a denial
 * of service against the database if nothing else.
 *
 * Kept in Postgres rather than memory because the app runs as serverless
 * functions. An in-process map is per-instance, so a caller spread across cold
 * starts would never be limited by one — which is worse than no limit, because
 * it looks like a limit.
 */

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  windowMs: number;
};

/**
 * Sign-in is the expensive one — it runs bcrypt — so its budget is the
 * tightest. It still has to allow a crew fumbling passwords on a Monday
 * morning from one office IP, which is why this is well above the per-account
 * lockout of 3.
 */
export const LOGIN_RULE: RateLimitRule = { limit: 20, windowMs: 5 * 60 * 1000 };

/**
 * Refresh is called by every device roughly every 15 minutes, and a handful of
 * devices can share one address, so the budget is looser. It is a ceiling on
 * abuse, not a shaping rule.
 */
export const REFRESH_RULE: RateLimitRule = {
  limit: 60,
  windowMs: 5 * 60 * 1000,
};

const STALE_MS = 24 * 60 * 60 * 1000;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; response: NextResponse; retryAfterSeconds: number };

/**
 * Count this request against `route` for its origin.
 *
 * Fixed window, not a sliding one: a caller can burst across a boundary and get
 * up to twice the limit in a short span. That is a known and accepted
 * imprecision — the point is a ceiling, and a sliding window costs either a
 * sorted set we don't have or a row per request.
 */
export async function rateLimit(
  req: Request,
  route: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const ip = clientIp(req.headers);
  const key = `${route}:${ip}`;
  const now = new Date();

  const existing = await prisma.apiRateLimit.findUnique({ where: { key } });
  const windowExpired =
    !existing || now.getTime() - existing.windowStart.getTime() > rule.windowMs;

  const count = windowExpired ? 1 : existing.count + 1;
  const windowStart = windowExpired ? now : existing.windowStart;

  await prisma.apiRateLimit.upsert({
    where: { key },
    create: { key, count, windowStart },
    update: { count, windowStart },
  });

  // Opportunistic cleanup, on the same principle as the login throttle's: a
  // spray across many addresses must not grow the table without bound.
  if (windowExpired) {
    await prisma.apiRateLimit.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    });
  }

  if (count > rule.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart.getTime() + rule.windowMs - now.getTime()) / 1000)
    );
    return {
      ok: false,
      retryAfterSeconds,
      response: apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", {
        // Standard header, so a client can wait the right amount rather than
        // guessing or retrying in a tight loop.
        headers: { "Retry-After": String(retryAfterSeconds) },
      }),
    };
  }

  return { ok: true };
}
