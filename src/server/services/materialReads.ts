import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import { iso, requiredIso, requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";
import type { MaterialRequestStatusValue } from "@/contracts/enums";

/** Just enough to put a material on a usage or request form. */
export type MaterialOption = {
  id: string;
  name: string;
  unit: string;
};

export type MaterialRow = MaterialOption & {
  costPrice: number;
  customerPrice: number;
  quantityOnHand: number;
  reorderThreshold: number;
  active: boolean;
  /** At or below the reorder threshold, and still in use. */
  low: boolean;
};

export type MaterialRequestRow = {
  id: string;
  /** Null when the worker described something not in the catalog yet. */
  materialId: string | null;
  materialName: string | null;
  materialUnit: string | null;
  description: string | null;
  quantityRequested: number;
  urgent: boolean;
  status: MaterialRequestStatusValue;
  responseNote: string | null;
  createdAt: string;
  respondedAt: string | null;
  workerName: string | null;
  taskId: string | null;
  /** The client whose job prompted the request, when it was tied to one. */
  taskClientName: string | null;
};

function toRequestRow(r: {
  id: string;
  materialId: string | null;
  material: { name: string; unit: string } | null;
  description: string | null;
  quantityRequested: unknown;
  urgent: boolean;
  status: string;
  responseNote: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  worker?: { name: string } | null;
  taskId: string | null;
  task?: { client: { name: string } } | null;
}): MaterialRequestRow {
  return {
    id: r.id,
    materialId: r.materialId,
    materialName: r.material?.name ?? null,
    materialUnit: r.material?.unit ?? null,
    description: r.description,
    quantityRequested: requiredMoney(r.quantityRequested as never),
    urgent: r.urgent,
    status: r.status as MaterialRequestStatusValue,
    responseNote: r.responseNote,
    createdAt: requiredIso(r.createdAt),
    respondedAt: iso(r.respondedAt),
    workerName: r.worker?.name ?? null,
    taskId: r.taskId,
    taskClientName: r.task?.client.name ?? null,
  };
}

/**
 * Materials that can go on new work.
 *
 * Retired materials stay off this list — they can't be used going forward,
 * though jobs that already consumed them keep their history.
 */
export async function listUsableMaterials(
  _actor: Actor
): Promise<ServiceResult<MaterialOption[]>> {
  // Any signed-in user: a worker picks from this to log usage or raise a
  // request, and an admin picks from it when finishing a job.
  const materials = await prisma.material.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });
  return ok(materials);
}

/** The full catalog, active and retired, for the materials admin screen. */
export async function listMaterials(
  actor: Actor
): Promise<ServiceResult<MaterialRow[]>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const materials = await prisma.material.findMany({
    orderBy: { name: "asc" },
  });

  return ok(
    materials.map((m) => {
      const quantityOnHand = requiredMoney(m.quantityOnHand);
      const reorderThreshold = requiredMoney(m.reorderThreshold);
      return {
        id: m.id,
        name: m.name,
        unit: m.unit,
        costPrice: requiredMoney(m.costPrice),
        customerPrice: requiredMoney(m.customerPrice),
        quantityOnHand,
        reorderThreshold,
        active: m.active,
        low: m.active && quantityOnHand <= reorderThreshold,
      };
    })
  );
}

/** The admin inbox: urgent first, then oldest first. */
export async function listPendingMaterialRequests(
  actor: Actor
): Promise<ServiceResult<MaterialRequestRow[]>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const requests = await prisma.materialRequest.findMany({
    where: { status: "PENDING" },
    include: {
      worker: { select: { name: true } },
      material: { select: { name: true, unit: true } },
      task: { include: { client: { select: { name: true } } } },
    },
    orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
  });
  return ok(requests.map(toRequestRow));
}

/** A worker's own recent requests, newest first, so they can see the answer. */
export async function listMyMaterialRequests(
  actor: Actor,
  opts: { take?: number } = {}
): Promise<ServiceResult<MaterialRequestRow[]>> {
  const requests = await prisma.materialRequest.findMany({
    where: { workerId: actor.id },
    include: { material: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 10,
  });
  return ok(requests.map(toRequestRow));
}
