import type { Role } from "@prisma/client";
import { forbidden, type ServiceError } from "./result";

/**
 * Who is performing an operation, independent of how they proved it.
 *
 * The transport authenticates — a cookie session on the web, a bearer token
 * from the mobile app — and hands the result down. Services never reach for a
 * session themselves, which is what lets the same function serve both.
 */
export type Actor = {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
};

/**
 * Authorization stays inside the service, not in the transport that calls it.
 *
 * Both transports already gate access — middleware by route, `requireRole` in
 * the action, a token check in the API — but a rule enforced only at the edge
 * is a rule that a future third entry point forgets. Re-asserting here costs
 * nothing and makes "who may do this" a property of the operation.
 */
export function assertRole(
  actor: Actor,
  ...roles: Role[]
): ServiceError | null {
  if (roles.includes(actor.role)) return null;
  return forbidden("You don't have access to that.");
}
