import { Role } from "@prisma/client";

/**
 * Who may administer whom.
 *
 * ADMIN and OWNER were previously peers that could each reset the other's
 * password, which made the split between them decorative: an admin could set
 * the owner's password and sign in as them, and either could mint a new account
 * in the other's role with a password they chose. Ranking the roles closes
 * that — you cannot hand out privileges above your own, and you cannot take
 * over an account that outranks or matches you.
 */
export const ROLE_RANK: Record<Role, number> = {
  WORKER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  WORKER: "Worker",
};

/**
 * May `actor` administer `target` — reset their password, change their role,
 * disable them, edit their pay?
 *
 * Strictly greater, so peers can't take each other over and nobody can
 * administer an owner. An owner who forgets their password uses "My account"
 * while signed in; if every owner is locked out, recovery is a deliberate
 * database-level action rather than something any admin can do quietly.
 */
export function canAdminister(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * May `actor` hand out `role`? Up to and including their own rank — an admin
 * can appoint another admin (a peer, not an escalation) but cannot create or
 * promote anyone to owner.
 */
export function canGrantRole(actor: Role, role: Role): boolean {
  return ROLE_RANK[role] <= ROLE_RANK[actor];
}

/** The roles `actor` is allowed to pick in a form, highest first. */
export function grantableRoles(actor: Role): Role[] {
  return (Object.keys(ROLE_RANK) as Role[])
    .filter((r) => canGrantRole(actor, r))
    .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
}
