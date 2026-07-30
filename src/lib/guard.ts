import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "./auth";

// Server-side authorization guard for use inside server actions and pages.
// Middleware already gates routes by role, but server actions are their own
// entry point and must re-check — never trust that the caller came through a
// gated page. Throws if the session is missing or the role isn't allowed.
export async function requireRole(...roles: Role[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !roles.includes(session.user.role)) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

// Any authenticated user — for actions/pages that belong to the signed-in
// user regardless of role (e.g. their own profile and password).
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}
