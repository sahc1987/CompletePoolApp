import type { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/actor";
import { apiError } from "./respond";
import { verifyAccessToken } from "./tokens";
import { DEMO_READ_ONLY_MESSAGE, isDemoUser } from "@/lib/demo";

/**
 * The API's counterpart to `lib/guard.ts`.
 *
 * `requireRole` reads a NextAuth cookie and throws; this reads a bearer token
 * and returns a response. What they must not differ on is the answer — both
 * produce the same `Actor`, and the services they call re-assert the role
 * either way.
 */

type Authenticated = { ok: true; actor: Actor };
type Rejected = { ok: false; response: NextResponse };
export type AuthResult = Authenticated | Rejected;

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token || null;
}

const unauthenticated = (): Rejected => ({
  ok: false,
  // One message for a missing token, a malformed one and an expired one. The
  // client's move is the same in every case — refresh, then sign in — and
  // distinguishing them only helps someone probing.
  response: apiError("UNAUTHENTICATED", "Sign in to continue."),
});

export type AuthOptions = {
  /** Roles allowed through. Omit to accept any authenticated user. */
  roles?: Role[];
  /**
   * Re-read the account from the database instead of trusting the token's
   * claims.
   *
   * An access token asserts a role for up to 15 minutes, so a demotion or a
   * deactivation inside that window is invisible to it. For a read, 15 minutes
   * of stale privilege is a fair trade for not querying on every request. For a
   * write it is not — so every mutating route passes `fresh: true`, and the
   * cost is one indexed lookup on a path that was going to hit the database
   * anyway.
   */
  fresh?: boolean;
};

/**
 * Authenticate a request and, optionally, authorize it.
 *
 * The role check here is a fast rejection, not the authority: the service the
 * route calls asserts it again. That redundancy is deliberate — a route that
 * forgot to pass `roles` still can't perform an operation its caller isn't
 * entitled to.
 */
export async function requireApi(
  req: Request,
  opts: AuthOptions = {}
): Promise<AuthResult> {
  const token = bearerToken(req);
  if (!token) return unauthenticated();

  const claims = await verifyAccessToken(token);
  if (!claims) return unauthenticated();

  let actor: Actor;

  // Anything that isn't a read re-reads the account, whatever the route asked
  // for: that's where the read-only demo account is recognised (by its email,
  // which the token doesn't carry) and turned away.
  const writing = req.method !== "GET" && req.method !== "HEAD";

  if (opts.fresh || writing) {
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    // Disabled or deleted since the token was minted. Same response as a bad
    // token: the account is no longer one that can act.
    if (!user?.active) return unauthenticated();
    actor = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    };
  } else {
    actor = { id: claims.userId, role: claims.role };
  }

  if (writing && isDemoUser(actor)) {
    return { ok: false, response: apiError("FORBIDDEN", DEMO_READ_ONLY_MESSAGE) };
  }

  if (opts.roles && !opts.roles.includes(actor.role)) {
    return {
      ok: false,
      response: apiError("FORBIDDEN", "You don't have access to that."),
    };
  }

  return { ok: true, actor };
}

/** Any signed-in user, trusting the token's claims. For reads. */
export const requireApiUser = (req: Request) => requireApi(req);

/** A specific role, re-read from the database. For writes. */
export const requireApiRole = (req: Request, ...roles: Role[]) =>
  requireApi(req, { roles, fresh: true });
