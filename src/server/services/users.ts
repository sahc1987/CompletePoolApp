import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAdminister, canGrantRole, ROLE_LABEL } from "@/lib/privileges";
import { notifyUser } from "@/lib/notify";
import { revokeAllForUser } from "@/server/api/tokens";
import { assertRole, type Actor } from "@/server/actor";
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  type ServiceError,
  type ServiceResult,
} from "@/server/result";
import {
  createUserSchema,
  resetUserPasswordSchema,
  saveEmploymentSchema,
  setUserRoleSchema,
  toggleUserActiveSchema,
  type CreateUserInput,
  type ResetUserPasswordInput,
  type SaveEmploymentInput,
  type SetUserRoleInput,
  type ToggleUserActiveInput,
} from "@/contracts/users";

// Both roles reach the team page, but what each may do there is decided by
// rank — see lib/privileges.ts.
const MANAGERS: Role[] = ["ADMIN", "OWNER"];
// Accounts that can reach this page at all. If we ever let the last one be
// disabled or demoted, nobody could administer the system again — so every
// mutation below checks that at least one active manager survives.
const PRIVILEGED: Role[] = ["ADMIN", "OWNER"];

/**
 * Load the target and confirm the actor outranks them. Every account mutation
 * goes through this — the page hides controls the actor can't use, and both
 * transports gate the route, but neither is the authority on who may be
 * administered.
 */
async function loadAdministrableTarget(actorRole: Role, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: notFound("User not found") };
  if (!canAdminister(actorRole, target.role)) {
    return {
      error: forbidden(
        `You can't administer ${ROLE_LABEL[target.role].toLowerCase()} accounts.`
      ),
    };
  }
  return { target };
}

function isTargetError(
  found: Awaited<ReturnType<typeof loadAdministrableTarget>>
): found is { error: ServiceError } {
  return "error" in found;
}

async function otherActiveManagersExist(excludeUserId: string) {
  const n = await prisma.user.count({
    where: { active: true, role: { in: PRIVILEGED }, id: { not: excludeUserId } },
  });
  return n > 0;
}

/** "YYYY-MM-DD" -> local-midnight Date, matching what was typed. */
const toLocalMidnight = (value?: string) =>
  value ? new Date(`${value}T00:00:00`) : null;

/**
 * Save employment details. A changed hourly rate also appends a PayRateChange
 * row — the rate field alone can't answer "what did we pay them in March", so
 * the history is the point, not a nicety.
 */
export async function saveEmployment(
  actor: Actor,
  input: SaveEmploymentInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...MANAGERS);
  if (denied) return denied;

  const parsed = saveEmploymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { userId, note } = parsed.data;

  const hourlyRate =
    parsed.data.hourlyRate === ""
      ? null
      : Math.round(Number(parsed.data.hourlyRate) * 100) / 100;
  const hiredOn = toLocalMidnight(parsed.data.hiredOn);
  const birthday = toLocalMidnight(parsed.data.birthday);

  const found = await loadAdministrableTarget(actor.role, userId);
  if (isTargetError(found)) return found.error;
  const before = found.target;

  const oldRate = before.hourlyRate === null ? null : Number(before.hourlyRate);
  const rateChanged = oldRate !== hourlyRate;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { hourlyRate, hiredOn, birthday },
    });

    // Only a real rate is logged; clearing the field isn't a pay change.
    if (rateChanged && hourlyRate !== null) {
      await tx.payRateChange.create({
        data: {
          userId,
          oldRate,
          newRate: hourlyRate,
          changedById: actor.id,
          note: note || null,
        },
      });
    }
  });

  return ok();
}

export async function setUserRole(
  actor: Actor,
  input: SetUserRoleInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...MANAGERS);
  if (denied) return denied;

  const parsed = setUserRoleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { userId, role } = parsed.data;

  // Changing your own role is how you accidentally lock yourself out.
  if (userId === actor.id) {
    return forbidden(
      "You can't change your own role — ask another admin or owner."
    );
  }

  const found = await loadAdministrableTarget(actor.role, userId);
  if (isTargetError(found)) return found.error;
  const target = found.target;
  if (target.role === role) return ok();

  // You can appoint a peer, but never someone above you — otherwise an admin
  // promotes a worker to owner, resets that worker's password (workers are
  // administrable), and signs in with owner privileges.
  if (!canGrantRole(actor.role, role)) {
    return forbidden(
      `You can't grant the ${ROLE_LABEL[role].toLowerCase()} role.`
    );
  }

  // Demoting the last manager would leave nobody able to administer users.
  const losingPrivilege =
    PRIVILEGED.includes(target.role) && !PRIVILEGED.includes(role);
  if (
    losingPrivilege &&
    target.active &&
    !(await otherActiveManagersExist(userId))
  ) {
    return conflict(
      "This is the last active admin/owner — promote someone else first."
    );
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  return ok();
}

/**
 * Disable (never delete) a user. Their history — tasks, approvals, payments —
 * stays intact and referenced; they simply can't sign in (see lib/auth.ts).
 */
export async function toggleUserActive(
  actor: Actor,
  input: ToggleUserActiveInput
): Promise<ServiceResult<{ active: boolean }>> {
  const denied = assertRole(actor, ...MANAGERS);
  if (denied) return denied;

  const parsed = toggleUserActiveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { userId } = parsed.data;

  if (userId === actor.id) {
    return forbidden("You can't disable your own account.");
  }

  const found = await loadAdministrableTarget(actor.role, userId);
  if (isTargetError(found)) return found.error;
  const target = found.target;

  if (
    target.active &&
    PRIVILEGED.includes(target.role) &&
    !(await otherActiveManagersExist(userId))
  ) {
    return conflict(
      "This is the last active admin/owner and can't be disabled."
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { active: !target.active },
  });

  // Disabling blocks the next web sign-in immediately, but a phone holds a
  // refresh token good for 30 days. Revoking here is what makes "disabled"
  // mean disabled on every device rather than only in the browser.
  if (!updated.active) await revokeAllForUser(userId);

  return ok({ active: updated.active });
}

export async function createUser(
  actor: Actor,
  input: CreateUserInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, ...MANAGERS);
  if (denied) return denied;

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { name, email, phone, role, password } = parsed.data;

  // Creating the account sets its first password, so minting one above your own
  // rank would be a direct route to privileges you don't have.
  if (!canGrantRole(actor.role, role)) {
    return forbidden(
      `You can't create ${ROLE_LABEL[role].toLowerCase()} accounts.`
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return conflict("Someone already uses that email.");

  const created = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone ?? null,
      role,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  return ok({ id: created.id });
}

/**
 * Set someone else's password (they forgot theirs). The current password is not
 * required here because a manager is acting, not the account owner — which is
 * exactly why it's restricted to accounts the actor outranks. Resetting a
 * password is equivalent to signing in as that person.
 */
export async function resetUserPassword(
  actor: Actor,
  input: ResetUserPasswordInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...MANAGERS);
  if (denied) return denied;

  const parsed = resetUserPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const found = await loadAdministrableTarget(actor.role, parsed.data.userId);
  if (isTargetError(found)) return found.error;

  await prisma.user.update({
    where: { id: found.target.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });

  // A reset is usually a response to someone having lost control of the
  // account. Any device still holding a refresh token would keep that access
  // for a month, so the new password would lock out only the legitimate owner.
  await revokeAllForUser(found.target.id);

  // A reset hands someone else control of an account; leave a trace the target
  // will see rather than letting it happen silently.
  await notifyUser(
    found.target.id,
    `${actor.name ?? "A manager"} reset your password.`,
    { link: "/account" }
  );

  return ok();
}
