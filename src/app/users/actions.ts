"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { ActionState } from "@/lib/actions";

// Both roles administer the team.
const MANAGERS: Role[] = ["ADMIN", "OWNER"];
// Accounts that can reach this page at all. If we ever let the last one be
// disabled or demoted, nobody could administer the system again — so every
// mutation below checks that at least one active manager survives.
const PRIVILEGED: Role[] = ["ADMIN", "OWNER"];

async function otherActiveManagersExist(excludeUserId: string) {
  const n = await prisma.user.count({
    where: { active: true, role: { in: PRIVILEGED }, id: { not: excludeUserId } },
  });
  return n > 0;
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(Role),
});

// Change a user's privileges.
export async function setUserRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...MANAGERS);
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { userId, role } = parsed.data;

  // Changing your own role is how you accidentally lock yourself out.
  if (userId === actor.id) {
    return { error: "You can't change your own role — ask another admin or owner." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found" };
  if (target.role === role) return { ok: true };

  // Demoting the last manager would leave nobody able to administer users.
  const losingPrivilege = PRIVILEGED.includes(target.role) && !PRIVILEGED.includes(role);
  if (losingPrivilege && target.active && !(await otherActiveManagersExist(userId))) {
    return { error: "This is the last active admin/owner — promote someone else first." };
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/users");
  return { ok: true };
}

// Disable (never delete) a user. Their history — tasks, approvals, payments —
// stays intact and referenced; they simply can't sign in (see lib/auth.ts).
export async function toggleUserActive(formData: FormData): Promise<void> {
  const actor = await requireRole(...MANAGERS);
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actor.id) return;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;

  if (target.active) {
    if (PRIVILEGED.includes(target.role) && !(await otherActiveManagersExist(userId))) {
      throw new Error("This is the last active admin/owner and can't be disabled.");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { active: !target.active },
  });
  revalidatePath("/users");
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("That email doesn't look right"),
  phone: z.string().trim().optional(),
  role: z.nativeEnum(Role),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(...MANAGERS);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { name, email, phone, role, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Someone already uses that email." };

  await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      role,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  revalidatePath("/users");
  return { ok: true };
}

const resetSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Set someone else's password (they forgot theirs). The current password is
// not required here because a manager is acting, not the account owner.
export async function resetUserPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(...MANAGERS);
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "User not found" };

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  revalidatePath("/users");
  return { ok: true };
}
