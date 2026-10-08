import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Material usage is recorded at exactly one moment in a job's life: when it is
// closed out. Two routes reach that point — the worker submitting for review,
// and an admin finishing the job from the calendar — so the parsing, the stock
// decrement, and the double-entry guard live here rather than in either one.

/** One material and how much of it a job consumed. */
export type MaterialUsage = {
  materialId: string;
  qty: number;
};

/**
 * Read `qty_<materialId>` inputs off a submitted form.
 *
 * A blank box is not a zero — the form lists the whole catalog, so most boxes
 * come back empty on every job. Only positive, finite quantities count.
 */
export function parseMaterialUsage(formData: FormData): MaterialUsage[] {
  const usage: MaterialUsage[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const qty = Number(value);
    if (Number.isFinite(qty) && qty > 0) {
      usage.push({ materialId: key.slice(4), qty });
    }
  }
  return usage;
}

/**
 * Has this job already had its material usage counted?
 *
 * Stock decrements once per job. A job that was submitted, flagged, and
 * reworked passes through the close-out path again, and the material was
 * already taken off the shelf the first time — counting it twice would drain
 * inventory that never left the truck. FLAGGED deliberately does not reverse
 * usage, so the movement rows are the durable record of that.
 */
export async function hasLoggedMaterials(taskId: string): Promise<boolean> {
  const count = await prisma.stockMovement.count({
    where: { taskId, type: "USAGE" },
  });
  return count > 0;
}

/**
 * Write a job's material usage inside an open transaction: an itemised
 * TaskMaterial row per material, the stock decrement, and the movement that
 * explains it.
 *
 * Prices are snapshotted onto the TaskMaterial row so a later price change
 * doesn't silently rewrite what an old job cost or billed.
 *
 * Callers are responsible for the double-entry guard — see
 * `hasLoggedMaterials` — and for billing *after* this runs, since the bill
 * totals the rows written here.
 */
export async function recordTaskMaterials(
  tx: Prisma.TransactionClient,
  taskId: string,
  usage: MaterialUsage[]
): Promise<void> {
  if (usage.length === 0) return;

  const materials = await tx.material.findMany({
    where: { id: { in: usage.map((u) => u.materialId) } },
  });
  const byId = new Map(materials.map((m) => [m.id, m]));

  for (const u of usage) {
    // An id with no material behind it is a stale form, not a reason to fail
    // the whole close-out.
    const m = byId.get(u.materialId);
    if (!m) continue;

    await tx.taskMaterial.create({
      data: {
        taskId,
        materialId: m.id,
        quantityUsed: u.qty,
        costPriceAtTimeOfUse: m.costPrice,
        customerPriceAtTimeOfUse: m.customerPrice,
      },
    });
    await tx.material.update({
      where: { id: m.id },
      data: { quantityOnHand: { decrement: u.qty } },
    });
    await tx.stockMovement.create({
      data: { materialId: m.id, type: "USAGE", quantity: -u.qty, taskId },
    });
  }
}

/**
 * Put a cancelled job's material back on the shelf, inside an open
 * transaction: one REVERSAL movement per material, equal and opposite to what
 * its USAGE movements took.
 *
 * Only cancelling reverses usage. FLAGGED never does — the material was
 * physically used, only the pricing was wrong. The TaskMaterial rows stay as
 * the record of what the job consumed before it was called off.
 */
export async function reverseTaskMaterials(
  tx: Prisma.TransactionClient,
  taskId: string
): Promise<void> {
  const usage = await tx.stockMovement.findMany({
    where: { taskId, type: "USAGE" },
  });

  const byMaterial = new Map<string, number>();
  for (const m of usage) {
    byMaterial.set(
      m.materialId,
      (byMaterial.get(m.materialId) ?? 0) + Number(m.quantity)
    );
  }

  for (const [materialId, quantity] of byMaterial) {
    // USAGE is stored negative, so giving it back is its absolute value.
    const back = Math.abs(quantity);
    if (back === 0) continue;
    await tx.material.update({
      where: { id: materialId },
      data: { quantityOnHand: { increment: back } },
    });
    await tx.stockMovement.create({
      data: {
        materialId,
        type: "REVERSAL",
        quantity: back,
        taskId,
        note: "Job cancelled",
      },
    });
  }
}
