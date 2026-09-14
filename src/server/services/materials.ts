import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import {
  badState,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  adjustStockSchema,
  respondMaterialRequestSchema,
  saveMaterialSchema,
  toggleMaterialSchema,
  type AdjustStockInput,
  type RespondMaterialRequestInput,
  type SaveMaterialInput,
  type ToggleMaterialInput,
} from "@/contracts/materials";

export async function saveMaterial(
  actor: Actor,
  input: SaveMaterialInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = saveMaterialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id, ...data } = parsed.data;

  // quantityOnHand is intentionally NOT editable here — it only moves through
  // logged StockMovements (restock/adjustment/usage).
  const saved = id
    ? await prisma.material.update({ where: { id }, data })
    : await prisma.material.create({ data: { ...data, quantityOnHand: 0 } });

  return ok({ id: saved.id });
}

export async function toggleMaterial(
  actor: Actor,
  input: ToggleMaterialInput
): Promise<ServiceResult<{ active: boolean }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = toggleMaterialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const material = await prisma.material.findUnique({
    where: { id: parsed.data.id },
  });
  if (!material) return notFound("Material not found.");

  const updated = await prisma.material.update({
    where: { id: material.id },
    data: { active: !material.active },
  });
  return ok({ active: updated.active });
}

/**
 * Every change to quantityOnHand is paired with a StockMovement so stock has a
 * full audit trail.
 */
export async function adjustStock(
  actor: Actor,
  input: AdjustStockInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { materialId, type, quantity, note } = parsed.data;
  if (quantity === 0) return invalid("Quantity can't be zero");

  const delta = type === "RESTOCK" ? Math.abs(quantity) : quantity;

  await prisma.$transaction([
    prisma.material.update({
      where: { id: materialId },
      data: { quantityOnHand: { increment: delta } },
    }),
    prisma.stockMovement.create({
      data: { materialId, type, quantity: delta, note: note ?? null },
    }),
  ]);
  return ok();
}

/**
 * Admin approves or denies a worker's material request. Approving does NOT
 * change quantityOnHand — "admin said yes" and "we physically have it" are
 * different events; stock only moves via a real RESTOCK once received.
 */
export async function respondMaterialRequest(
  actor: Actor,
  input: RespondMaterialRequestInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = respondMaterialRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { requestId, decision, note } = parsed.data;

  const req = await prisma.materialRequest.findUnique({
    where: { id: requestId },
  });
  if (!req || req.status !== "PENDING") {
    return badState("This request has already been handled.");
  }

  await prisma.materialRequest.update({
    where: { id: requestId },
    data: {
      status: decision,
      respondedById: actor.id,
      responseNote: note ?? null,
      respondedAt: new Date(),
    },
  });
  return ok();
}
