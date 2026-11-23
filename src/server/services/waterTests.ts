import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import { badState, invalid, notFound, ok, type ServiceResult } from "@/server/result";
import { money, requiredIso } from "@/server/serialize";
import {
  saveWaterTestSchema,
  type SaveWaterTestInput,
  type WaterTestReading,
} from "@/contracts/waterTest";

/**
 * Water-test readings.
 *
 * Workers write (their own job, while it is in progress); admins and the owner
 * read the history. Saving is an upsert keyed by the task, so the phone can
 * replay a queued save any number of times — same input, same row.
 */

type Row = {
  id: string;
  taskId: string;
  poolId: string;
  takenAt: Date;
  freeChlorine: Prisma.Decimal | number | null;
  ph: Prisma.Decimal | number | null;
  alkalinity: number | null;
  cyanuricAcid: number | null;
};

const toReading = (r: Row): WaterTestReading => ({
  id: r.id,
  taskId: r.taskId,
  poolId: r.poolId,
  takenAt: requiredIso(r.takenAt),
  freeChlorine: money(r.freeChlorine),
  ph: money(r.ph),
  alkalinity: r.alkalinity,
  cyanuricAcid: r.cyanuricAcid,
});

export async function saveWaterTest(
  actor: Actor,
  input: SaveWaterTestInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "WORKER");
  if (denied) return denied;

  const parsed = saveWaterTestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);
  const { taskId, freeChlorine, ph, alkalinity, cyanuricAcid } = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, workerId: true, poolId: true, status: true },
  });
  // Someone else's job answers 404, not 403: a worker has no business learning
  // which task ids exist.
  if (!task || task.workerId !== actor.id) return notFound("Task not found.");
  if (task.status !== "IN_PROGRESS") {
    return badState("Start the job before recording a water test.");
  }

  // A re-save replaces the reading, so a value left blank this time is cleared.
  const values = {
    freeChlorine: freeChlorine ?? null,
    ph: ph ?? null,
    alkalinity: alkalinity ?? null,
    cyanuricAcid: cyanuricAcid ?? null,
  };
  await prisma.waterTest.upsert({
    where: { taskId },
    update: { ...values, takenAt: new Date() },
    create: { taskId, poolId: task.poolId, recordedById: actor.id, ...values },
  });
  return ok();
}

/**
 * The reading for one job. A worker sees their own jobs' only; admin and owner
 * see any. Null when nothing has been recorded yet.
 */
export async function getTaskWaterTest(
  actor: Actor,
  taskId: string
): Promise<ServiceResult<WaterTestReading | null>> {
  const denied = assertRole(actor, "WORKER", "ADMIN", "OWNER");
  if (denied) return denied;

  const row = await prisma.waterTest.findUnique({
    where: { taskId },
    include: { task: { select: { workerId: true } } },
  });
  if (actor.role === "WORKER" && row && row.task.workerId !== actor.id) {
    return notFound("Task not found.");
  }
  return ok(row ? toReading(row) : null);
}

/** A pool's recent readings, newest first. */
export async function listPoolWaterTests(
  actor: Actor,
  poolId: string,
  limit = 12
): Promise<ServiceResult<WaterTestReading[]>> {
  const denied = assertRole(actor, "ADMIN", "OWNER");
  if (denied) return denied;

  const rows = await prisma.waterTest.findMany({
    where: { poolId },
    orderBy: { takenAt: "desc" },
    take: Math.min(Math.max(1, limit), 50),
  });
  return ok(rows.map(toReading));
}

/** Recent readings for every pool of one client, for the client page. Keyed by pool id. */
export async function waterTestsForClient(
  actor: Actor,
  clientId: string,
  perPool = 8
): Promise<ServiceResult<Record<string, WaterTestReading[]>>> {
  const denied = assertRole(actor, "ADMIN", "OWNER");
  if (denied) return denied;

  const pools = await prisma.pool.findMany({ where: { clientId }, select: { id: true } });
  const rows = await prisma.waterTest.findMany({
    where: { poolId: { in: pools.map((p) => p.id) } },
    orderBy: { takenAt: "desc" },
  });
  const byPool: Record<string, WaterTestReading[]> = {};
  for (const r of rows) {
    const list = (byPool[r.poolId] ??= []);
    if (list.length < perPool) list.push(toReading(r));
  }
  return ok(byPool);
}
