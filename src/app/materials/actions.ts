"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { ActionState } from "@/lib/actions";

const materialSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  unit: z.string().trim().min(1, "Unit is required (e.g. gallon, unit)"),
  costPrice: z.coerce.number().nonnegative("Cost can't be negative"),
  customerPrice: z.coerce.number().nonnegative("Customer price can't be negative"),
  reorderThreshold: z.coerce.number().nonnegative("Reorder threshold can't be negative"),
});

export async function saveMaterial(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  if (id) {
    // quantityOnHand is intentionally NOT editable here — it only moves
    // through logged StockMovements (restock/adjustment/usage).
    await prisma.material.update({ where: { id }, data });
  } else {
    await prisma.material.create({ data: { ...data, quantityOnHand: 0 } });
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function toggleMaterial(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const m = await prisma.material.findUnique({ where: { id } });
  if (!m) return;
  await prisma.material.update({ where: { id }, data: { active: !m.active } });
  revalidatePath("/materials");
}

const adjustSchema = z.object({
  materialId: z.string().min(1),
  type: z.enum(["RESTOCK", "ADJUSTMENT"]),
  quantity: z.coerce.number(),
  note: z.string().trim().optional(),
});

// Every change to quantityOnHand is paired with a StockMovement so stock has
// a full audit trail. RESTOCK is always additive; ADJUSTMENT can be + or -
// (recount, damage, etc.).
export async function adjustStock(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { materialId, type, quantity, note } = parsed.data;
  if (quantity === 0) return { error: "Quantity can't be zero" };

  const delta = type === "RESTOCK" ? Math.abs(quantity) : quantity;

  await prisma.$transaction([
    prisma.material.update({
      where: { id: materialId },
      data: { quantityOnHand: { increment: delta } },
    }),
    prisma.stockMovement.create({
      data: { materialId, type, quantity: delta, note: note || null },
    }),
  ]);
  revalidatePath("/materials");
  return { ok: true };
}

const respondSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "DENIED"]),
  note: z.string().trim().optional(),
});

// Admin approves or denies a worker's material request. Approving does NOT
// change quantityOnHand — "admin said yes" and "we physically have it" are
// different events; stock only moves via a real RESTOCK once received.
export async function respondMaterialRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("ADMIN");
  const parsed = respondSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { requestId, decision, note } = parsed.data;

  const req = await prisma.materialRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") {
    return { error: "This request has already been handled." };
  }

  await prisma.materialRequest.update({
    where: { id: requestId },
    data: {
      status: decision,
      respondedById: user.id,
      responseNote: note || null,
      respondedAt: new Date(),
    },
  });
  revalidatePath("/materials");
  revalidatePath("/worker");
  return { ok: true };
}
