"use server";

import { getThrottleState, type ThrottleState } from "@/lib/loginThrottle";

export type LoginFeedback = ThrottleState;

/**
 * Turns the generic NextAuth failure into a message that says what actually
 * happened — how many tries are left, or how long the lock has to run.
 *
 * This is a public entry point: server actions are callable by anyone who can
 * craft the request, not just by the login page. It therefore reads only the
 * LoginAttempt table, which is keyed by the address that was typed and knows
 * nothing about whether an account exists. An address nobody has tried and a
 * real employee's address nobody has tried return byte-identical results, so a
 * caller can't use it to enumerate staff.
 */
export async function getLoginFeedback(email: string): Promise<LoginFeedback> {
  return getThrottleState(email);
}
