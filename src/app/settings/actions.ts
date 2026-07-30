"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { notifyAll } from "@/lib/notify";
import type { ActionState } from "@/lib/actions";

const decimal = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).nonnegative(`${label} can't be negative`);

// --- Services ----------------------------------------------------------
const serviceSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  basePrice: decimal("Base price"),
  defaultDurationMin: z.coerce.number().int().positive("Duration must be a positive whole number"),
});

export async function saveService(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  if (id) {
    await prisma.service.update({ where: { id }, data });
    await notifyAll(`Service "${data.name}" was updated.`, {
      link: "/calendar",
      exceptUserId: actor.id,
    });
  } else {
    await prisma.service.create({ data });
    await notifyAll(`New service added: "${data.name}".`, {
      link: "/calendar",
      exceptUserId: actor.id,
    });
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteService(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const count = await prisma.task.count({ where: { serviceId: id } });
  if (count > 0) throw new Error("This service is used by tasks and can't be deleted.");
  await prisma.service.delete({ where: { id } });
  revalidatePath("/settings");
}

// --- Extra services ----------------------------------------------------
const extraSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  price: decimal("Price"),
});

export async function saveExtra(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const parsed = extraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  if (id) {
    await prisma.extraService.update({ where: { id }, data });
  } else {
    await prisma.extraService.create({ data });
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteExtra(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const count = await prisma.taskExtra.count({ where: { extraServiceId: id } });
  if (count > 0) throw new Error("This extra is used by tasks and can't be deleted.");
  await prisma.extraService.delete({ where: { id } });
  revalidatePath("/settings");
}

// --- Tax rates ---------------------------------------------------------
const taxSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  rate: decimal("Rate"),
});

export async function saveTaxRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const parsed = taxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  if (id) {
    await prisma.taxRate.update({ where: { id }, data });
  } else {
    await prisma.taxRate.create({ data });
  }
  revalidatePath("/settings");
  return { ok: true };
}

// Tax rates are snapshotted onto estimates when applied, so old estimates
// are safe. We deactivate rather than delete to keep them out of new
// estimates while preserving the catalog row.
export async function toggleTaxRate(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const rate = await prisma.taxRate.findUnique({ where: { id } });
  if (!rate) return;
  await prisma.taxRate.update({ where: { id }, data: { active: !rate.active } });
  revalidatePath("/settings");
}
