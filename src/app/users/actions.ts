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

// Optional "YYYY-MM-DD" -> local-midnight Date, or null when blank. Parsed from
// local parts so the stored day matches what was typed (a bare ISO string is
// UTC and lands on the previous day west of Greenwich).
const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: `${label} must be a valid date`,
    })
    .transform((v) => (v === "" ? null : new Date(`${v}T00:00:00`)));

const employmentSchema = z.object({
  userId: z.string().min(1),
  hourlyRate: z
    .string()
    .trim()
    .refine((v) => v === "" || Number(v) >= 0, {
      message: "Hourly pay can't be negative",
    })
    .refine((v) => v === "" || !Number.isNaN(Number(v)), {
      message: "Hourly pay must be a number",
    })
    .transform((v) => (v === "" ? null : Math.round(Number(v) * 100) / 100)),
  hiredOn: optionalDate("Hire date"),
  birthday: optionalDate("Birthday"),
  note: z.string().trim().max(200).optional(),
});

/**
 * Save employment details. A changed hourly rate also appends a
 * PayRateChange row — the rate field alone can't answer "what did we pay
 * them in March", so the history is the point, not a nicety.
 */
export async function saveEmployment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...MANAGERS);
  const parsed = employmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { userId, hourlyRate, hiredOn, birthday, note } = parsed.data;

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { hourlyRate: true },
  });
  if (!before) return { error: "User not found" };

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

  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  return { ok: true };
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
