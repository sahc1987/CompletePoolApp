"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { ActionState } from "@/lib/actions";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("That email doesn't look right").or(z.literal("")).optional(),
  notes: z.string().trim().optional(),
});

const poolSchema = z.object({
  address: z.string().trim().min(1, "Address is required"),
  size: z.string().trim().optional(),
  type: z.string().trim().optional(),
});

export async function createClient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { name, phone, email, notes } = parsed.data;

  const client = await prisma.client.create({
    data: {
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    },
  });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing client id" };
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { name, phone, email, notes } = parsed.data;

  await prisma.client.update({
    where: { id },
    data: {
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    },
  });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function deleteClient(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Don't orphan history: block deletion if the client has any tasks or
  // estimates. Pools with no tasks are removed alongside the client.
  const [taskCount, estimateCount] = await Promise.all([
    prisma.task.count({ where: { clientId: id } }),
    prisma.estimate.count({ where: { clientId: id } }),
  ]);
  if (taskCount > 0 || estimateCount > 0) {
    throw new Error(
      "This client has tasks or estimates on record and can't be deleted."
    );
  }

  await prisma.pool.deleteMany({ where: { clientId: id } });
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function createPool(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { error: "Missing client id" };
  const parsed = poolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { address, size, type } = parsed.data;

  await prisma.pool.create({
    data: { clientId, address, size: size || null, type: type || null },
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function updatePool(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!id) return { error: "Missing pool id" };
  const parsed = poolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { address, size, type } = parsed.data;

  await prisma.pool.update({
    where: { id },
    data: { address, size: size || null, type: type || null },
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function deletePool(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!id) return;

  const taskCount = await prisma.task.count({ where: { poolId: id } });
  if (taskCount > 0) {
    throw new Error("This pool has tasks on record and can't be deleted.");
  }
  await prisma.pool.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}`);
}
