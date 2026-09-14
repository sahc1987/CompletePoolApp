"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as usersService from "@/server/services/users";
import type { ActionState } from "@/lib/actions";

const MANAGERS = ["ADMIN", "OWNER"] as const;

export async function saveEmployment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...MANAGERS);
  const userId = str(formData, "userId");
  const res = await usersService.saveEmployment(actor, {
    userId,
    hourlyRate: str(formData, "hourlyRate"),
    hiredOn: str(formData, "hiredOn"),
    birthday: str(formData, "birthday"),
    note: opt(formData, "note"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  return { ok: true };
}

export async function setUserRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...MANAGERS);
  const res = await usersService.setUserRole(actor, {
    userId: str(formData, "userId"),
    role: str(formData, "role"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/users");
  return { ok: true };
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const actor = await requireRole(...MANAGERS);
  const userId = str(formData, "userId");
  // The page never renders this control for your own row. The service still
  // refuses it (the API needs a 403), but reaching it here means a stale form,
  // not something worth throwing an error page over.
  if (!userId || userId === actor.id) return;

  const res = await usersService.toggleUserActive(actor, { userId });
  // No state to render into, so a refusal surfaces as an error boundary — the
  // last-active-manager guard has always behaved this way.
  if (!res.ok) throw new Error(res.error);

  revalidatePath("/users");
}

export async function createUser(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...MANAGERS);
  const res = await usersService.createUser(actor, {
    name: str(formData, "name"),
    email: str(formData, "email"),
    phone: opt(formData, "phone"),
    role: str(formData, "role"),
    password: str(formData, "password"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/users");
  return { ok: true };
}

export async function resetUserPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...MANAGERS);
  const res = await usersService.resetUserPassword(actor, {
    userId: str(formData, "userId"),
    password: str(formData, "password"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/users");
  return { ok: true };
}
