import { prisma } from "./prisma";

// Sign-in throttling policy, shared by the credentials provider and the login
// page so the UI can never claim something the server doesn't enforce.
export const MAX_LOGIN_ATTEMPTS = 3;
export const LOCKOUT_SECONDS = 30;

// Attempt rows outlive their usefulness the moment the lock expires; anything
// untouched for this long is deleted so a spray across thousands of addresses
// can't grow the table without bound.
const STALE_MS = 24 * 60 * 60 * 1000;

export type ThrottleState = {
  /** Seconds left on an active lock; 0 when not locked. */
  lockedSeconds: number;
  /** Failed attempts remaining before the next lock. */
  attemptsLeft: number;
};

/** Normalised so "Sam@X.com " and "sam@x.com" share one bucket. */
export const throttleKey = (email: string) => email.trim().toLowerCase();

function stateFrom(row: { failedCount: number; lockedUntil: Date | null } | null): ThrottleState {
  const msLeft = row?.lockedUntil ? row.lockedUntil.getTime() - Date.now() : 0;
  if (msLeft > 0) {
    return {
      lockedSeconds: Math.min(LOCKOUT_SECONDS, Math.ceil(msLeft / 1000)),
      attemptsLeft: 0,
    };
  }
  return {
    lockedSeconds: 0,
    attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - (row?.failedCount ?? 0)),
  };
}

/**
 * Current throttle state for an address. Never consults the User table, so an
 * address nobody has tried reads exactly like a real account nobody has tried.
 */
export async function getThrottleState(email: string): Promise<ThrottleState> {
  const row = await prisma.loginAttempt.findUnique({
    where: { email: throttleKey(email) },
    select: { failedCount: true, lockedUntil: true },
  });
  return stateFrom(row);
}

/** True when this address is inside an active lock window. */
export async function isLockedOut(email: string): Promise<boolean> {
  return (await getThrottleState(email)).lockedSeconds > 0;
}

/**
 * Count one failed sign-in. Called for every rejection — wrong password,
 * unknown address, disabled account — so all three advance the same counter at
 * the same rate.
 */
export async function recordFailure(email: string): Promise<ThrottleState> {
  const key = throttleKey(email);
  const existing = await prisma.loginAttempt.findUnique({ where: { email: key } });

  // A lock that has already expired leaves a stale `lockedUntil`; treat the
  // round as finished and start counting again from zero.
  const expired = !!existing?.lockedUntil && existing.lockedUntil <= new Date();
  const base = !existing || expired ? 0 : existing.failedCount;
  const failedCount = base + 1;
  const lock = failedCount >= MAX_LOGIN_ATTEMPTS;

  // Reset the counter alongside the lock so the next round gets a full set of
  // attempts rather than locking on every subsequent try.
  const data = lock
    ? { failedCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_SECONDS * 1000) }
    : { failedCount, lockedUntil: null };

  const row = await prisma.loginAttempt.upsert({
    where: { email: key },
    create: { email: key, ...data },
    update: data,
  });

  // Opportunistic cleanup — cheap, and only on the failure path.
  await prisma.loginAttempt.deleteMany({
    where: { updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
  });

  return stateFrom(row);
}

/** Successful sign-in wipes the address's accumulated strikes. */
export async function clearFailures(email: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { email: throttleKey(email) } });
}

// --- Per-source throttling -------------------------------------------------
//
// The per-email counter above does nothing against spraying: one password
// tried against forty addresses leaves every account on one failure. This
// counts failures by origin instead.
//
// The budget is deliberately loose. A whole office can share one address
// behind NAT, and a crew fumbling passwords on a Monday morning must not lock
// the company out — but 20 failures in 15 minutes from one source is not a
// person mistyping.
export const MAX_SOURCE_FAILURES = 20;
const SOURCE_WINDOW_MS = 15 * 60 * 1000;
const SOURCE_LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Best-effort client address. On Vercel `x-forwarded-for` is set by the proxy
 * and its first entry is the real client; the header is attacker-controlled on
 * a bare origin, so this throttle is a speed bump for spraying rather than a
 * hard authorisation boundary — the per-account lock remains the real limit.
 */
export function clientIp(headers: {
  get?: (k: string) => string | null | undefined;
  [k: string]: unknown;
}): string {
  const read = (k: string): string | undefined => {
    if (typeof headers.get === "function") return headers.get(k) ?? undefined;
    const v = (headers as Record<string, unknown>)[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return String(v[0]);
    return undefined;
  };
  const fwd = read("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || read("x-real-ip")?.trim() || "unknown";
}

/** True when this source has burnt its failure budget. */
export async function isSourceBlocked(ip: string): Promise<boolean> {
  const row = await prisma.loginSource.findUnique({
    where: { ip },
    select: { lockedUntil: true },
  });
  return !!row?.lockedUntil && row.lockedUntil > new Date();
}

/** Count one failed sign-in against its origin. */
export async function recordSourceFailure(ip: string): Promise<void> {
  const now = new Date();
  const existing = await prisma.loginSource.findUnique({ where: { ip } });

  // Outside the window (or past a spent lock) the tally starts over.
  const stale =
    !existing ||
    now.getTime() - existing.windowStart.getTime() > SOURCE_WINDOW_MS ||
    (!!existing.lockedUntil && existing.lockedUntil <= now);

  const failedCount = stale ? 1 : existing.failedCount + 1;
  const lock = failedCount >= MAX_SOURCE_FAILURES;
  const data = {
    failedCount: lock ? 0 : failedCount,
    windowStart: stale ? now : existing.windowStart,
    lockedUntil: lock ? new Date(now.getTime() + SOURCE_LOCKOUT_MS) : null,
  };

  await prisma.loginSource.upsert({
    where: { ip },
    create: { ip, ...data },
    update: data,
  });

  await prisma.loginSource.deleteMany({
    where: { updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
  });
}

/**
 * A correct sign-in clears the source's tally. Someone who can authenticate
 * isn't the spray we're trying to stop, and leaving the count standing would
 * let one forgetful person degrade a shared office address all morning.
 */
export async function clearSourceFailures(ip: string): Promise<void> {
  await prisma.loginSource.deleteMany({ where: { ip } });
}
