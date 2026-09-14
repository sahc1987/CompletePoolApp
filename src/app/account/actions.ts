"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as accountService from "@/server/services/account";
import type { ActionState } from "@/lib/actions";

export async function updateProfile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const res = await accountService.updateProfile(actor, {
    name: str(formData, "name"),
    phone: opt(formData, "phone"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/account");
  // Note: the name shown in the header comes from the JWT and refreshes on
  // next sign-in.
  return { ok: true };
}

export async function changePassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const res = await accountService.changePassword(actor, {
    currentPassword: str(formData, "currentPassword"),
    newPassword: str(formData, "newPassword"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!res.ok) return { error: res.error };
  return { ok: true };
}
