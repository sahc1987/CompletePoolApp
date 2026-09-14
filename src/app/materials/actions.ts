"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as materialsService from "@/server/services/materials";
import type { ActionState } from "@/lib/actions";

export async function saveMaterial(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await materialsService.saveMaterial(actor, {
    id: opt(formData, "id"),
    name: str(formData, "name"),
    unit: str(formData, "unit"),
    costPrice: str(formData, "costPrice"),
    customerPrice: str(formData, "customerPrice"),
    reorderThreshold: str(formData, "reorderThreshold"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/materials");
  return { ok: true };
}

export async function toggleMaterial(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  await materialsService.toggleMaterial(actor, { id: str(formData, "id") });
  revalidatePath("/materials");
}

export async function adjustStock(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await materialsService.adjustStock(actor, {
    materialId: str(formData, "materialId"),
    type: str(formData, "type"),
    quantity: str(formData, "quantity"),
    note: opt(formData, "note"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/materials");
  return { ok: true };
}

export async function respondMaterialRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await materialsService.respondMaterialRequest(actor, {
    requestId: str(formData, "requestId"),
    decision: str(formData, "decision"),
    note: opt(formData, "note"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/materials");
  revalidatePath("/worker");
  return { ok: true };
}
