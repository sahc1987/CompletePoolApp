/**
 * Session timing shared by the server config (lib/auth.ts) and the client-side
 * renewer (components/SessionKeepAlive). It lives in its own module because
 * lib/auth.ts pulls in prisma and bcrypt, which must not follow an import into
 * the browser bundle.
 */

/**
 * Idle lifetime of the session cookie. Every hit on /api/auth/session re-issues
 * the token with a fresh expiry, so this is the window of *inactivity* a
 * session survives, not its total length. Long enough that a worker out on a
 * route all morning is never bounced mid-job; short enough that a tablet left
 * in a truck isn't a live session by evening.
 */
export const SESSION_MAX_AGE_S = 8 * 60 * 60;

/**
 * How often an open tab renews the token. Kept far below SESSION_MAX_AGE_S so
 * several renewals can fail — no signal in a yard, a laptop asleep — without
 * the session lapsing.
 */
export const SESSION_REFRESH_S = 10 * 60;

/**
 * Ceiling on renewals. Sliding expiry with no cap makes a tab left open forever
 * a credential that never expires, so the token records when it was minted and
 * refuses to renew past this, forcing a real sign-in.
 */
export const ABSOLUTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
