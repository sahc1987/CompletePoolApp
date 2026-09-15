import { prisma } from "@/lib/prisma";
import { paidAmount } from "@/lib/billing";
import { getBusinessTimezone } from "@/lib/schedule";
import { addZonedDays, zonedDayKey } from "@/lib/timezone";
import { assertRole, type Actor } from "@/server/actor";
import { iso, requiredIso, requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";
import type {
  PaymentMethodValue,
  PaymentStatusValue,
  TaskStatusValue,
} from "@/contracts/enums";

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

/**
 * Which calendar day the business considers "now".
 *
 * A phone carries its own timezone and a worker can cross one; the server runs
 * UTC on Vercel. Neither is the business's clock. Handing these down as plain
 * `YYYY-MM-DD` strings means a client groups its jobs by string equality and
 * never does timezone arithmetic of its own — which is the only way the phone
 * and the office agree on what "today" means.
 */
export type BusinessDay = {
  /** IANA zone the whole business runs on. */
  timezone: string;
  today: string;
  tomorrow: string;
};

export async function getBusinessDay(): Promise<BusinessDay> {
  const timezone = await getBusinessTimezone();
  const now = new Date();
  return {
    timezone,
    today: zonedDayKey(now, timezone),
    tomorrow: zonedDayKey(addZonedDays(now, 1, timezone), timezone),
  };
}

export type WorkerTaskRow = {
  id: string;
  status: TaskStatusValue;
  /**
   * Absolute instant the job starts, for rendering a time of day.
   *
   * Do not derive a calendar day from this on a device — see `dayKey`.
   */
  startTime: string;
  /**
   * The business-local calendar day this job falls on, `YYYY-MM-DD`.
   *
   * Compare it against `BusinessDay.today`/`tomorrow` by string equality.
   */
  dayKey: string;
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

  const timezone = await getBusinessTimezone();
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
      dayKey: zonedDayKey(t.startTime, timezone),
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

  const timezone = await getBusinessTimezone();
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
      dayKey: zonedDayKey(t.startTime, timezone),
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

export type CalendarTaskRow = {
  id: string;
  title: string;
  clientName: string;
  address: string;
  /** Null for a worker — they never see money. */
  price: number | null;
  workerId: string;
  workerName: string;
  serviceId: string;
  durationMin: number;
  start: string;
  end: string;
  status: TaskStatusValue;
  /**
   * Quantities are safe for anyone who can see the job; the prices they were
   * logged at are not, so they stay out of the payload.
   */
  materialsUsed: { name: string; unit: string; quantityUsed: number }[];
  /** Admin only. */
  bill: {
    amount: number;
    paid: number;
    balance: number;
    status: PaymentStatusValue;
    method: PaymentMethodValue | null;
    paidAt: string | null;
  } | null;
};

/**
 * Jobs for the calendar, redacted to what the actor may see.
 *
 * A worker gets only their own jobs, with no price and no billing — that
 * redaction is the whole reason this belongs in the service rather than in a
 * page. A client that filters money out of its own render is one bug away from
 * showing it.
 */
export async function listCalendarTasks(
  actor: Actor
): Promise<ServiceResult<CalendarTaskRow[]>> {
  const isWorker = actor.role === "WORKER";
  const isAdmin = actor.role === "ADMIN";

  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(isWorker ? { workerId: actor.id } : {}),
    },
    include: {
      client: { select: { name: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
      bill: { include: { payments: true } },
      // What the job has already consumed, so the finish form can show it
      // instead of inviting a second entry.
      materials: {
        include: { material: { select: { name: true, unit: true } } },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return ok(
    tasks.map((t) => {
      const start = t.startTime;
      const end = new Date(start.getTime() + t.durationMin * 60_000);
      const billAmount = t.bill ? requiredMoney(t.bill.amount) : 0;
      const billPaid = t.bill ? paidAmount(t.bill.payments) : 0;

      return {
        id: t.id,
        title: t.service.name,
        clientName: t.client.name,
        address: t.pool.address,
        price: isWorker ? null : requiredMoney(t.price),
        workerId: t.workerId,
        workerName: t.worker.name,
        serviceId: t.serviceId,
        durationMin: t.durationMin,
        start: requiredIso(start),
        end: requiredIso(end),
        status: t.status as TaskStatusValue,
        materialsUsed: t.materials.map((m) => ({
          name: m.material.name,
          unit: m.material.unit,
          quantityUsed: requiredMoney(m.quantityUsed),
        })),
        bill:
          isAdmin && t.bill
            ? {
                amount: billAmount,
                paid: billPaid,
                balance: Math.round((billAmount - billPaid) * 100) / 100,
                status: t.bill.status as PaymentStatusValue,
                method: t.bill.method as PaymentMethodValue | null,
                paidAt: iso(t.bill.paidAt),
              }
            : null,
      };
    })
  );
}
