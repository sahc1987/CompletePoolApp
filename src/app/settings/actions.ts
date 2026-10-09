"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as settingsService from "@/server/services/settings";
import type { ActionState } from "@/lib/actions";

// --- Services ----------------------------------------------------------

export async function saveService(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.saveService(actor, {
    id: opt(formData, "id"),
    name: str(formData, "name"),
    basePrice: str(formData, "basePrice"),
    defaultDurationMin: str(formData, "defaultDurationMin"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteService(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.deleteService(actor, {
    id: str(formData, "id"),
  });
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/settings");
}

// --- Business hours ----------------------------------------------------

export async function saveWorkHours(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.saveWorkHours(actor, {
    workdayStart: str(formData, "workdayStart"),
    workdayEnd: str(formData, "workdayEnd"),
    timezone: str(formData, "timezone"),
  });
  if (!res.ok) return { error: res.error };

  // Business hours and timezone are read by every page, so the whole tree has
  // to re-render, not just /settings.
  revalidatePath("/", "layout");
  return { ok: true };
}

// --- Extra services ----------------------------------------------------

export async function saveExtra(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.saveExtra(actor, {
    id: opt(formData, "id"),
    name: str(formData, "name"),
    price: str(formData, "price"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteExtra(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.deleteExtra(actor, {
    id: str(formData, "id"),
  });
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/settings");
}

// --- Tax rates ---------------------------------------------------------

export async function saveTaxRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.saveTaxRate(actor, {
    id: opt(formData, "id"),
    name: str(formData, "name"),
    rate: str(formData, "rate"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleTaxRate(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  await settingsService.toggleTaxRate(actor, { id: str(formData, "id") });
  revalidatePath("/settings");
}

// --- Company identity --------------------------------------------------

export async function saveCompanyInfo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await settingsService.saveCompanyInfo(actor, {
    name: str(formData, "name"),
    tagline: opt(formData, "tagline"),
    address: opt(formData, "address"),
    phone: opt(formData, "phone"),
    email: opt(formData, "email"),
    website: opt(formData, "website"),
    taxId: opt(formData, "taxId"),
    paymentTerms: opt(formData, "paymentTerms"),
    paymentNote: opt(formData, "paymentNote"),
    documentFooter: opt(formData, "documentFooter"),
  });
  if (!res.ok) return { error: res.error };

  // Printed on billing documents and the public pay page.
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true };
}
