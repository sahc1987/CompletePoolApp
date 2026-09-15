import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  clearFailures,
  clearSourceFailures,
  isLockedOut,
  isSourceBlocked,
  recordFailure,
  recordSourceFailure,
} from "@/lib/loginThrottle";

/**
 * The one place a password is checked.
 *
 * Both sign-in paths call this: NextAuth's credentials provider for the web,
 * and POST /api/v1/auth/login for the mobile app. They must not drift, because
 * what this function gets right is subtle and easy to lose in a second copy —
 * the order of the throttle checks, and the fact that an unknown address, a
 * disabled account and a wrong password are indistinguishable in both the
 * response and the time taken to produce it.
 */

export type CredentialCheck = {
  email: string;
  password: string;
  /** Client address, for the per-source spray throttle. */
  ip: string;
};

export type VerifiedUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
};

/**
 * Verify an email and password, counting the attempt against both throttles.
 *
 * Returns the user, or null. Deliberately null rather than a reason: every
 * caller renders the same message, and a caller that *could* distinguish
 * "no such account" from "wrong password" is one refactor away from saying so.
 */
export async function verifyCredentials(
  input: CredentialCheck
): Promise<VerifiedUser | null> {
  const email = input.email.trim().toLowerCase();

  // Throttle first, and by the address typed rather than by account. Checking
  // the user before the lock would let response timing separate "no such
  // address" from "locked out".
  if (await isLockedOut(email)) return null;
  // The per-account lock can't see a spray — one password against forty
  // addresses leaves every account on a single failure. This can.
  if (await isSourceBlocked(input.ip)) return null;

  const fail = async () => {
    await Promise.all([recordFailure(email), recordSourceFailure(input.ip)]);
    return null;
  };

  const user = await prisma.user.findUnique({ where: { email } });

  // Unknown address, disabled account and wrong password all take the same
  // branch: one strike, one null. Nothing distinguishes them.
  if (!user?.active) return fail();
  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    return fail();
  }

  await Promise.all([clearFailures(email), clearSourceFailures(input.ip)]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}
