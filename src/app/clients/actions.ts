"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as clientsService from "@/server/services/clients";
import type { ActionState } from "@/lib/actions";

// Read the shared client/pool fields off a form once.
const clientFields = (formData: FormData) => ({
  name: str(formData, "name"),
  phone: opt(formData, "phone"),
  email: opt(formData, "email"),
  address: opt(formData, "address"),
  notes: opt(formData, "notes"),
});

const poolFields = (formData: FormData) => ({
  address: str(formData, "address"),
  size: opt(formData, "size"),
  type: opt(formData, "type"),
});

export async function createClient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await clientsService.createClient(actor, clientFields(formData));
  if (!res.ok) return { error: res.error };

  revalidatePath("/clients");
  redirect(`/clients/${res.data.id}`);
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const id = str(formData, "id");
  const res = await clientsService.updateClient(actor, {
    id,
    ...clientFields(formData),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function deleteClient(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const res = await clientsService.deleteClient(actor, {
    id: str(formData, "id"),
  });
  // This action has no state to render into, so a refusal surfaces the same way
  // it always has: as an error boundary rather than a silent no-op.
  if (!res.ok) throw new Error(res.error);

  revalidatePath("/clients");
  redirect("/clients");
}

export async function createPool(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const clientId = str(formData, "clientId");
  const res = await clientsService.createPool(actor, {
    clientId,
    ...poolFields(formData),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function updatePool(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await clientsService.updatePool(actor, {
    id: str(formData, "id"),
    ...poolFields(formData),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath(`/clients/${str(formData, "clientId")}`);
  return { ok: true };
}

export async function deletePool(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const res = await clientsService.deletePool(actor, {
    id: str(formData, "id"),
  });
  if (!res.ok) throw new Error(res.error);

  revalidatePath(`/clients/${str(formData, "clientId")}`);
}
