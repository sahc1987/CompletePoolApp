import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import { iso, requiredIso, requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";
import type { TaskStatusValue } from "@/contracts/enums";

/**
 * Task read models for the worker's own list and the admin review queue.
 *
 * Both are phase-2/4 mobile screens, so the shapes here are what the API will
 * return: money as numbers, instants as ISO strings. Grouping a worker's jobs
 * into today/tomorrow/later is presentation and stays with the caller — but see
 * the note on `startTime` below before doing it on a device.
 */

export type TaskMaterialRow = {
  materialId: string;
  name: string;
  unit: string;
  quantityUsed: number;
  /** What the customer is charged per unit, snapshotted at time of use. */
  customerPrice: number;
};

export type TaskExtraRow = {
  id: string;
  name: string;
  price: number;
};

export type WorkerTaskRow = {
  id: string;
  status: TaskStatusValue;
  /**
   * Absolute instant the job starts. Which calendar day that falls on is a
   * business-timezone question, not a device one — resolve it against
   * `AppSettings.timezone`, never the phone's clock.
   */
  startTime: string;
  durationMin: number;
  price: number;
  notes: string | null;
  flagReason: string | null;
  submittedAt: string | null;
  clientName: string;
  clientPhone: string | null;
  poolAddress: string;
  serviceName: string;
};

export type ReviewTaskRow = WorkerTaskRow & {
  workerName: string;
  extras: TaskExtraRow[];
  materials: TaskMaterialRow[];
};

/** Jobs still on a worker's plate — approved and cancelled drop off. */
const ACTIVE_WORKER_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "SUBMITTED",
  "FLAGGED",
] as const;

export async function listMyTasks(
  actor: Actor
): Promise<ServiceResult<WorkerTaskRow[]>> {
  const denied = assertRole(actor, "WORKER");
  if (denied) return denied;

  const tasks = await prisma.task.findMany({
    where: {
      workerId: actor.id,
      status: { in: [...ACTIVE_WORKER_STATUSES] },
    },
    include: {
      client: { select: { name: true, phone: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return ok(
    tasks.map((t) => ({
      id: t.id,
      status: t.status as TaskStatusValue,
      startTime: requiredIso(t.startTime),
      durationMin: t.durationMin,
      price: requiredMoney(t.price),
      notes: t.notes,
      flagReason: t.flagReason,
      submittedAt: iso(t.submittedAt),
      clientName: t.client.name,
      clientPhone: t.client.phone,
      poolAddress: t.pool.address,
      serviceName: t.service.name,
    }))
  );
}

/**
 * Jobs waiting on an admin's decision, oldest first.
 *
 * Approving raises the bill and materials are part of what it charges, so they
 * travel with the row — whoever approves it should see what they're billing.
 */
export async function listReviewQueue(
  actor: Actor
): Promise<ServiceResult<ReviewTaskRow[]>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const tasks = await prisma.task.findMany({
    where: { status: "SUBMITTED" },
    include: {
      client: { select: { name: true, phone: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
      extras: { include: { extraService: { select: { name: true } } } },
      materials: {
        include: { material: { select: { name: true, unit: true } } },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return ok(
    tasks.map((t) => ({
      id: t.id,
      status: t.status as TaskStatusValue,
      startTime: requiredIso(t.startTime),
      durationMin: t.durationMin,
      price: requiredMoney(t.price),
      notes: t.notes,
      flagReason: t.flagReason,
      submittedAt: iso(t.submittedAt),
      clientName: t.client.name,
      clientPhone: t.client.phone,
      poolAddress: t.pool.address,
      serviceName: t.service.name,
      workerName: t.worker.name,
      extras: t.extras.map((e) => ({
        id: e.id,
        name: e.extraService.name,
        price: requiredMoney(e.priceAtTimeOfSale),
      })),
      materials: t.materials.map((m) => ({
        materialId: m.materialId,
        name: m.material.name,
        unit: m.material.unit,
        quantityUsed: requiredMoney(m.quantityUsed),
        customerPrice: requiredMoney(m.customerPriceAtTimeOfUse),
      })),
    }))
  );
}
