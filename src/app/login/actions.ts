"use server";

import { prisma } from "@/lib/prisma";
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_SECONDS } from "@/lib/auth";

export type LoginFeedback = {
  /** Seconds left on an active lock; 0 when not locked. */
  lockedSeconds: number;
  /** Failed attempts remaining before the next lock. */
  attemptsLeft: number;
};

// Called by the login page only after a sign-in attempt has already failed, to
// turn the generic NextAuth error into a message that says what actually
// happened. It reveals nothing a caller could not learn by simply retrying.
export async function getLoginFeedback(email: string): Promise<LoginFeedback> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { failedLoginAttempts: true, lockedUntil: true },
  });

  // Unknown or inactive email: report the default so a wrong address is
  // indistinguishable from a wrong password.
  if (!user) return { lockedSeconds: 0, attemptsLeft: MAX_LOGIN_ATTEMPTS - 1 };

  const msLeft = user.lockedUntil
    ? user.lockedUntil.getTime() - Date.now()
    : 0;
  if (msLeft > 0) {
    return {
      lockedSeconds: Math.min(LOCKOUT_SECONDS, Math.ceil(msLeft / 1000)),
      attemptsLeft: 0,
    };
  }

  return {
    lockedSeconds: 0,
    attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - user.failedLoginAttempts),
  };
}
