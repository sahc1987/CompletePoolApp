"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as estimatesService from "@/server/services/estimates";
import type { ActionState } from "@/lib/actions";

const STAFF = ["ADMIN", "WORKER"] as const;

export async function createEstimate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...STAFF);
  const res = await estimatesService.createEstimate(actor, {
    mode: str(formData, "mode") || "existing",
    clientId: opt(formData, "clientId"),
    poolId: opt(formData, "poolId"),
    newName: opt(formData, "newName"),
    newPhone: opt(formData, "newPhone"),
    newEmail: opt(formData, "newEmail"),
    newAddress: opt(formData, "newAddress"),
    notes: opt(formData, "notes"),
    validUntil: opt(formData, "validUntil"),
  });
  if (!res.ok) return { error: res.error };

  // Capturing a prospect on the spot adds a client row, so that list is stale.
  if (res.data.createdClient) revalidatePath("/clients");
  revalidatePath("/estimates");
  redirect(`/estimates/${res.data.id}`);
}

export async function addLineItem(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  const res = await estimatesService.addLineItem(actor, {
    estimateId,
    description: str(formData, "description"),
    quantity: str(formData, "quantity"),
    unitPrice: str(formData, "unitPrice"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function deleteLineItem(formData: FormData): Promise<void> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  await estimatesService.deleteLineItem(actor, {
    estimateId,
    id: str(formData, "id"),
  });
  revalidatePath(`/estimates/${estimateId}`);
}

export async function addTax(formData: FormData): Promise<void> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  await estimatesService.addTax(actor, {
    estimateId,
    taxRateId: str(formData, "taxRateId"),
  });
  revalidatePath(`/estimates/${estimateId}`);
}

export async function removeTax(formData: FormData): Promise<void> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  await estimatesService.removeTax(actor, {
    estimateId,
    id: str(formData, "id"),
  });
  revalidatePath(`/estimates/${estimateId}`);
}

export async function presentEstimate(formData: FormData): Promise<void> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  await estimatesService.presentEstimate(actor, { estimateId });
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/estimates");
}

export async function backToDraft(formData: FormData): Promise<void> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  await estimatesService.backToDraft(actor, { estimateId });
  revalidatePath(`/estimates/${estimateId}`);
}

export async function signEstimate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  const res = await estimatesService.signEstimate(actor, {
    estimateId,
    signedByName: str(formData, "signedByName"),
    signatureData: str(formData, "signatureData"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/estimates");
  return { ok: true };
}

export async function declineEstimate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole(...STAFF);
  const estimateId = str(formData, "estimateId");
  const res = await estimatesService.declineEstimate(actor, {
    estimateId,
    declineReason: opt(formData, "declineReason"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/estimates");
  return { ok: true };
}

export async function deleteEstimate(formData: FormData): Promise<void> {
  const actor = await requireRole(...STAFF);
  const res = await estimatesService.deleteEstimate(actor, {
    estimateId: str(formData, "estimateId"),
  });
  if (!res.ok) return;

  revalidatePath("/estimates");
  redirect("/estimates");
}
