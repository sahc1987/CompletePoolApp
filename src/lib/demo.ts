/**
 * The public demo account: a read-only admin anyone can sign in as from the
 * login page, to look around the app.
 *
 * It's an ordinary ADMIN row so every screen an admin sees renders for it, and
 * it's made read-only at the two doors every change goes through —
 * `requireUser`/`requireRole` (web server actions) and `requireApi` (any
 * non-GET API call). Services don't know about it; nothing below those doors
 * needs to.
 *
 * The account is recognised by its email, fixed here rather than configured,
 * so a missing setting can't quietly turn a writable account into "the demo".
 * The login button appears only while DEMO_LOGIN_PASSWORD is set.
 */

export const DEMO_EMAIL = "demo@completepool.app";

export const DEMO_READ_ONLY_MESSAGE =
  "This is a read-only demo account, so changes are turned off.";

export function isDemoUser(user: { email?: string | null } | null | undefined): boolean {
  return !!user?.email && user.email.trim().toLowerCase() === DEMO_EMAIL;
}

/** The demo password while the demo login is switched on; null hides the button. */
export function demoPassword(): string | null {
  return process.env.DEMO_LOGIN_PASSWORD?.trim() || null;
}
