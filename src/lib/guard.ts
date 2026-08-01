import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { authOptions } from "./auth";

// Server-side authorization guard for use inside server actions and pages.
// Middleware already gates routes by role, but server actions are their own
// entry point and must re-check — never trust that the caller came through a
// gated page. Throws if the session is missing or the role isn't allowed.
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("Unauthorized");
  return user;
}

// Any authenticated user — for actions/pages that belong to the signed-in
// user regardless of role (e.g. their own profile and password).
export async function requireUser() {
  const session = await getServerSession(authOptions);
  // A revoked account yields no session at all — see the session callback in
  // lib/auth.ts — so the plain null check covers deactivation too.
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

/**
 * Page-level equivalent of requireRole: redirects instead of throwing, so an
 * unauthorized visitor gets the same screens as before rather than an error
 * boundary. Returns the session so callers keep using `session.user.*`.
 *
 * Pages previously leaned entirely on middleware for their role check, but
 * middleware only decodes the existing cookie — it can't reach the database
 * from the edge runtime, so it still sees whatever role was true at sign-in.
 * This runs in the node runtime where the jwt callback has already refreshed
 * the role, which is what makes a demotion take effect on reads.
 */
export async function requirePageSession(...roles: Role[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (roles.length > 0 && !roles.includes(session.user.role)) {
    redirect("/unauthorized");
  }
  return session;
}
