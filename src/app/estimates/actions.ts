"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { toNumber } from "@/lib/serialize";
import type { ActionState } from "@/lib/actions";

const STAFF = ["ADMIN", "WORKER"] as const;

// Recompute subtotal/tax/total from current line items + applied taxes, and
// write the snapshot back onto the estimate and each tax row. Called after
// every edit and again at present time, so the signed numbers are final.
async function recalc(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { lineItems: true, taxes: true },
  });
  if (!estimate) return;

  const subtotal = estimate.lineItems.reduce(
    (s, li) => s + (toNumber(li.quantity) ?? 0) * (toNumber(li.unitPrice) ?? 0),
    0
  );
  let taxTotal = 0;
  for (const t of estimate.taxes) {
    const amount = (subtotal * (toNumber(t.ratePercent) ?? 0)) / 100;
    taxTotal += amount;
    await prisma.estimateTax.update({ where: { id: t.id }, data: { amount } });
  }
  await prisma.estimate.update({
    where: { id: estimateId },
    data: { subtotal, taxTotal, total: subtotal + taxTotal },
  });
}

// Load a DRAFT estimate for editing; returns null if missing or locked.
async function editableDraft(id: string) {
  if (!id) return null;
  const est = await prisma.estimate.findUnique({ where: { id } });
  if (!est || est.status !== "DRAFT") return null;
  return est;
}

// Two shapes behind one form: quote an existing client, or capture a brand new
// one on the spot. Workers meet prospects in the field before they're in the
// system, so requiring an admin to add the client first would stall the quote.
const createSchema = z
  .object({
    mode: z.enum(["existing", "new"]).default("existing"),
    clientId: z.string().optional(),
    poolId: z.string().optional(),
    newName: z.string().trim().optional(),
    newPhone: z.string().trim().optional(),
    newEmail: z
      .string()
      .trim()
      .email("That email doesn't look right")
      .or(z.literal(""))
      .optional(),
    newAddress: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    validUntil: z.string().optional(),
  })
  .refine((d) => d.mode === "new" || !!d.clientId, {
    message: "Pick a client",
  })
  .refine((d) => d.mode === "existing" || !!d.newName, {
    message: "Enter the new customer's name",
  });

export async function createEstimate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole(...STAFF);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  let clientId = d.clientId ?? "";
  let poolId = d.poolId || null;

  if (d.mode === "new") {
    const name = d.newName!;
    // A worker in the field can't see the client list while typing, so catch
    // the obvious duplicate rather than quietly creating a second record.
    const dupe = await prisma.client.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { name: true },
    });
    if (dupe) {
      return {
        error: `“${dupe.name}” is already a customer — pick them from the list instead.`,
      };
    }

    const created = await prisma.client.create({
      data: {
        name,
        phone: d.newPhone || null,
        email: d.newEmail || null,
        address: d.newAddress || null,
        // The address they gave is where the pool is, so seed the service
        // location too — otherwise the estimate has nowhere to point.
        pools: d.newAddress ? { create: { address: d.newAddress } } : undefined,
      },
      include: { pools: { select: { id: true } } },
    });
    clientId = created.id;
    poolId = created.pools[0]?.id ?? null;
    revalidatePath("/clients");
  }

  const estimate = await prisma.estimate.create({
    data: {
      clientId,
      poolId,
      createdById: user.id,
      notes: d.notes || null,
      validUntil: d.validUntil ? new Date(`${d.validUntil}T00:00:00`) : null,
      subtotal: 0,
      taxTotal: 0,
      total: 0,
    },
  });
  revalidatePath("/estimates");
  redirect(`/estimates/${estimate.id}`);
}

const lineSchema = z.object({
  estimateId: z.string().min(1),
  description: z.string().trim().min(1, "Describe the line item"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().nonnegative("Price can't be negative"),
});

export async function addLineItem(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(...STAFF);
  const parsed = lineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  if (!(await editableDraft(d.estimateId))) return { error: "This estimate is locked." };

  await prisma.estimateLineItem.create({
    data: {
      estimateId: d.estimateId,
      description: d.description,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
    },
  });
  await recalc(d.estimateId);
  revalidatePath(`/estimates/${d.estimateId}`);
  return { ok: true };
}

export async function deleteLineItem(formData: FormData): Promise<void> {
  await requireRole(...STAFF);
  const id = String(formData.get("id") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  if (!(await editableDraft(estimateId))) return;
  await prisma.estimateLineItem.delete({ where: { id } });
  await recalc(estimateId);
  revalidatePath(`/estimates/${estimateId}`);
}

export async function addTax(formData: FormData): Promise<void> {
  await requireRole(...STAFF);
  const estimateId = String(formData.get("estimateId") ?? "");
  const taxRateId = String(formData.get("taxRateId") ?? "");
  if (!(await editableDraft(estimateId)) || !taxRateId) return;

  const rate = await prisma.taxRate.findUnique({ where: { id: taxRateId } });
  if (!rate) return;
  // Don't add the same rate twice.
  const existing = await prisma.estimateTax.findFirst({
    where: { estimateId, taxRateId },
  });
  if (existing) return;

  // Snapshot name + rate so a later catalog change never rewrites this estimate.
  await prisma.estimateTax.create({
    data: {
      estimateId,
      taxRateId,
      name: rate.name,
      ratePercent: rate.rate,
      amount: 0,
    },
  });
  await recalc(estimateId);
  revalidatePath(`/estimates/${estimateId}`);
}

export async function removeTax(formData: FormData): Promise<void> {
  await requireRole(...STAFF);
  const id = String(formData.get("id") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  if (!(await editableDraft(estimateId))) return;
  await prisma.estimateTax.delete({ where: { id } });
  await recalc(estimateId);
  revalidatePath(`/estimates/${estimateId}`);
}

export async function presentEstimate(formData: FormData): Promise<void> {
  await requireRole(...STAFF);
  const id = String(formData.get("estimateId") ?? "");
  const est = await editableDraft(id);
  if (!est) return;
  const lineCount = await prisma.estimateLineItem.count({ where: { estimateId: id } });
  if (lineCount === 0) return; // nothing to present
  await recalc(id);
  await prisma.estimate.update({
    where: { id },
    data: { status: "PRESENTED", presentedAt: new Date() },
  });
  revalidatePath(`/estimates/${id}`);
  revalidatePath("/estimates");
}

export async function backToDraft(formData: FormData): Promise<void> {
  await requireRole(...STAFF);
  const id = String(formData.get("estimateId") ?? "");
  const est = await prisma.estimate.findUnique({ where: { id } });
  if (!est || est.status !== "PRESENTED") return;
  await prisma.estimate.update({
    where: { id },
    data: { status: "DRAFT", presentedAt: null },
  });
  revalidatePath(`/estimates/${id}`);
}

const signSchema = z.object({
  estimateId: z.string().min(1),
  signedByName: z.string().trim().min(1, "Enter the client's name"),
  signatureData: z.string().min(1, "Capture a signature first"),
});

export async function signEstimate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(...STAFF);
  const parsed = signSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  const est = await prisma.estimate.findUnique({ where: { id: d.estimateId } });
  if (!est || est.status !== "PRESENTED") return { error: "This estimate isn't ready to sign." };

  const now = new Date();
  await prisma.estimate.update({
    where: { id: d.estimateId },
    data: {
      status: "APPROVED",
      signedByName: d.signedByName,
      signatureData: d.signatureData,
      signedAt: now,
      respondedAt: now,
    },
  });
  revalidatePath(`/estimates/${d.estimateId}`);
  revalidatePath("/estimates");
  return { ok: true };
}

const declineSchema = z.object({
  estimateId: z.string().min(1),
  declineReason: z.string().trim().optional(),
});

export async function declineEstimate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(...STAFF);
  const parsed = declineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const est = await prisma.estimate.findUnique({ where: { id: parsed.data.estimateId } });
  if (!est || est.status !== "PRESENTED") return { error: "This estimate isn't presented." };

  await prisma.estimate.update({
    where: { id: parsed.data.estimateId },
    data: {
      status: "DECLINED",
      declineReason: parsed.data.declineReason || null,
      respondedAt: new Date(),
    },
  });
  revalidatePath(`/estimates/${parsed.data.estimateId}`);
  revalidatePath("/estimates");
  return { ok: true };
}

export async function deleteEstimate(formData: FormData): Promise<void> {
  await requireRole(...STAFF);
  const id = String(formData.get("estimateId") ?? "");
  const est = await prisma.estimate.findUnique({ where: { id } });
  if (!est || est.status !== "DRAFT") return;
  await prisma.estimateTax.deleteMany({ where: { estimateId: id } });
  await prisma.estimateLineItem.deleteMany({ where: { estimateId: id } });
  await prisma.estimate.delete({ where: { id } });
  revalidatePath("/estimates");
  redirect("/estimates");
}
