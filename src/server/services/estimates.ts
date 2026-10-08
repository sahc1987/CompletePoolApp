import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/serialize";
import { notifyRoles } from "@/lib/notify";
import { assertRole, type Actor } from "@/server/actor";
import { createTask } from "./scheduling";
import {
  badState,
  conflict,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  addLineItemSchema,
  addTaxSchema,
  createEstimateSchema,
  declineEstimateSchema,
  deleteLineItemSchema,
  estimateIdSchema,
  removeTaxSchema,
  scheduleEstimateSchema,
  signEstimateSchema,
  type AddLineItemInput,
  type AddTaxInput,
  type CreateEstimateInput,
  type DeclineEstimateInput,
  type DeleteLineItemInput,
  type EstimateIdInput,
  type RemoveTaxInput,
  type ScheduleEstimateInput,
  type SignEstimateInput,
} from "@/contracts/estimates";

// Estimates are built and presented by whoever is in front of the customer, so
// both staff roles reach every operation here. Owner is deliberately excluded:
// they are read-only outside of team administration.
const STAFF = ["ADMIN", "WORKER"] as const;

/**
 * Recompute subtotal/tax/total from current line items + applied taxes, and
 * write the snapshot back onto the estimate and each tax row. Called after
 * every edit and again at present time, so the signed numbers are final.
 */
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

/** Load a DRAFT estimate for editing; returns null if missing or locked. */
async function editableDraft(id: string) {
  if (!id) return null;
  const est = await prisma.estimate.findUnique({ where: { id } });
  if (!est || est.status !== "DRAFT") return null;
  return est;
}

export async function createEstimate(
  actor: Actor,
  input: CreateEstimateInput
): Promise<ServiceResult<{ id: string; createdClient: boolean }>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = createEstimateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  let clientId = d.clientId ?? "";
  let poolId = d.poolId ?? null;
  let createdClient = false;

  if (d.mode === "new") {
    const name = d.newName!;
    // A worker in the field can't see the client list while typing, so catch
    // the obvious duplicate rather than quietly creating a second record.
    const dupe = await prisma.client.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { name: true },
    });
    if (dupe) {
      return conflict(
        `“${dupe.name}” is already a customer — pick them from the list instead.`
      );
    }

    const created = await prisma.client.create({
      data: {
        name,
        phone: d.newPhone ?? null,
        email: d.newEmail ?? null,
        address: d.newAddress ?? null,
        // The address they gave is where the pool is, so seed the service
        // location too — otherwise the estimate has nowhere to point.
        pools: d.newAddress ? { create: { address: d.newAddress } } : undefined,
      },
      include: { pools: { select: { id: true } } },
    });
    clientId = created.id;
    poolId = created.pools[0]?.id ?? null;
    createdClient = true;
  }

  const estimate = await prisma.estimate.create({
    data: {
      clientId,
      poolId,
      createdById: actor.id,
      notes: d.notes ?? null,
      validUntil: d.validUntil ? new Date(`${d.validUntil}T00:00:00`) : null,
      subtotal: 0,
      taxTotal: 0,
      total: 0,
    },
  });
  return ok({ id: estimate.id, createdClient });
}

export async function addLineItem(
  actor: Actor,
  input: AddLineItemInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = addLineItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  if (!(await editableDraft(d.estimateId))) {
    return badState("This estimate is locked.");
  }

  const created = await prisma.estimateLineItem.create({
    data: {
      estimateId: d.estimateId,
      description: d.description,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
    },
  });
  await recalc(d.estimateId);
  return ok({ id: created.id });
}

export async function deleteLineItem(
  actor: Actor,
  input: DeleteLineItemInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = deleteLineItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { estimateId, id } = parsed.data;

  if (!(await editableDraft(estimateId))) {
    return badState("This estimate is locked.");
  }
  // Scoped to the estimate that was checked above: a line id from another
  // (possibly signed) estimate must not be removable through a draft's id.
  const removed = await prisma.estimateLineItem.deleteMany({
    where: { id, estimateId },
  });
  if (removed.count === 0) return notFound("Line item not found.");
  await recalc(estimateId);
  return ok();
}

export async function addTax(
  actor: Actor,
  input: AddTaxInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = addTaxSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { estimateId, taxRateId } = parsed.data;

  if (!(await editableDraft(estimateId))) {
    return badState("This estimate is locked.");
  }

  const rate = await prisma.taxRate.findUnique({ where: { id: taxRateId } });
  if (!rate) return notFound("Tax rate not found.");

  // Don't add the same rate twice.
  const existing = await prisma.estimateTax.findFirst({
    where: { estimateId, taxRateId },
  });
  if (existing) return conflict("That tax is already applied.");

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
  return ok();
}

export async function removeTax(
  actor: Actor,
  input: RemoveTaxInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = removeTaxSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { estimateId, id } = parsed.data;

  if (!(await editableDraft(estimateId))) {
    return badState("This estimate is locked.");
  }
  const removed = await prisma.estimateTax.deleteMany({
    where: { id, estimateId },
  });
  if (removed.count === 0) return notFound("Tax not found.");
  await recalc(estimateId);
  return ok();
}

export async function presentEstimate(
  actor: Actor,
  input: EstimateIdInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = estimateIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { estimateId } = parsed.data;

  if (!(await editableDraft(estimateId))) {
    return badState("This estimate can't be presented.");
  }

  const lineCount = await prisma.estimateLineItem.count({
    where: { estimateId },
  });
  if (lineCount === 0) return badState("Add a line item before presenting.");

  await recalc(estimateId);
  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "PRESENTED", presentedAt: new Date() },
  });
  return ok();
}

export async function backToDraft(
  actor: Actor,
  input: EstimateIdInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = estimateIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const est = await prisma.estimate.findUnique({
    where: { id: parsed.data.estimateId },
  });
  if (!est) return notFound("Estimate not found.");
  if (est.status !== "PRESENTED") {
    return badState("Only a presented estimate can go back to draft.");
  }

  await prisma.estimate.update({
    where: { id: est.id },
    data: { status: "DRAFT", presentedAt: null },
  });
  return ok();
}

export async function signEstimate(
  actor: Actor,
  input: SignEstimateInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = signEstimateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  const est = await prisma.estimate.findUnique({
    where: { id: d.estimateId },
  });
  if (!est || est.status !== "PRESENTED") {
    return badState("This estimate isn't ready to sign.");
  }

  const now = new Date();
  const signed = await prisma.estimate.update({
    where: { id: d.estimateId },
    data: {
      status: "APPROVED",
      signedByName: d.signedByName,
      signatureData: d.signatureData,
      signedAt: now,
      respondedAt: now,
    },
    include: { client: { select: { name: true } } },
  });

  // Signed work only turns into a job once an admin schedules it.
  await notifyRoles(
    ["ADMIN"],
    `${signed.client.name} signed an estimate for $${(toNumber(signed.total) ?? 0).toFixed(2)} — ready to schedule.`,
    { link: `/estimates/${signed.id}`, exceptUserId: actor.id }
  );
  return ok();
}

/**
 * Schedule a signed estimate as a job. Goes through `createTask`, so the job
 * gets the same business-hours and double-booking checks as any other, and the
 * estimate is linked to it so it can't be scheduled twice.
 */
export async function scheduleEstimate(
  actor: Actor,
  input: ScheduleEstimateInput
): Promise<ServiceResult<{ taskId: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = scheduleEstimateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  const est = await prisma.estimate.findUnique({
    where: { id: d.estimateId },
    include: { lineItems: { orderBy: { id: "asc" } } },
  });
  if (!est) return notFound("Estimate not found.");
  if (est.status !== "APPROVED") {
    return badState("Only a signed estimate can be scheduled.");
  }
  if (est.convertedTaskId) return conflict("This estimate is already scheduled.");

  const created = await createTask(actor, {
    clientId: est.clientId,
    poolId: d.poolId,
    workerId: d.workerId,
    serviceId: d.serviceId,
    date: d.date,
    time: d.time,
    durationMin: d.durationMin,
    price: d.price,
    notes:
      d.notes ??
      `From signed estimate: ${est.lineItems.map((li) => li.description).join(", ")}`,
    extras: [],
    repeat: "NONE",
  });
  if (!created.ok) return created;

  await prisma.estimate.update({
    where: { id: est.id },
    data: { convertedTaskId: created.data.id },
  });
  return ok({ taskId: created.data.id });
}

export async function declineEstimate(
  actor: Actor,
  input: DeclineEstimateInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = declineEstimateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { estimateId, declineReason } = parsed.data;

  const est = await prisma.estimate.findUnique({ where: { id: estimateId } });
  if (!est || est.status !== "PRESENTED") {
    return badState("This estimate isn't presented.");
  }

  const declined = await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      status: "DECLINED",
      declineReason: declineReason ?? null,
      respondedAt: new Date(),
    },
    include: { client: { select: { name: true } } },
  });
  await notifyRoles(
    ["ADMIN"],
    `${declined.client.name} declined an estimate${declineReason ? `: ${declineReason}` : "."}`,
    { link: `/estimates/${declined.id}`, exceptUserId: actor.id }
  );
  return ok();
}

export async function deleteEstimate(
  actor: Actor,
  input: EstimateIdInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const parsed = estimateIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { estimateId } = parsed.data;

  const est = await prisma.estimate.findUnique({ where: { id: estimateId } });
  if (!est) return notFound("Estimate not found.");
  if (est.status !== "DRAFT") {
    return badState("Only a draft estimate can be deleted.");
  }

  await prisma.estimateTax.deleteMany({ where: { estimateId } });
  await prisma.estimateLineItem.deleteMany({ where: { estimateId } });
  await prisma.estimate.delete({ where: { id: estimateId } });
  return ok();
}
