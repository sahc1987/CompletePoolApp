import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/actor";
import { invalid, notFound, ok, type ServiceResult } from "@/server/result";
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from "@/contracts/account";

// Anyone signed in may edit their own profile and password, so there is no role
// assertion here — the actor identifies the only row these can touch.

export async function updateProfile(
  actor: Actor,
  input: UpdateProfileInput
): Promise<ServiceResult<void>> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
    },
  });
  return ok();
}

export async function changePassword(
  actor: Actor,
  input: ChangePasswordInput
): Promise<ServiceResult<void>> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user) return notFound("Account not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return invalid("Your current password is wrong.");

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return invalid("New password must be different from the current one.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  return ok();
}
