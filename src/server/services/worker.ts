import { prisma } from "@/lib/prisma";
import {
  hasLoggedMaterials,
  recordTaskMaterials,
} from "@/lib/materials";
import { assertRole, type Actor } from "@/server/actor";
import {
  badState,
  forbidden,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  createMaterialRequestSchema,
  startTaskSchema,
  submitTaskSchema,
  type CreateMaterialRequestInput,
  type StartTaskInput,
  type SubmitTaskInput,
} from "@/contracts/worker";

/**
 * A worker moves their own jobs and nothing else. Returning "not found" for
 * someone else's task rather than "forbidden" is deliberate — a worker has no
 * business learning which task ids exist.
 */
async function loadOwnTask(taskId: string, workerId: string) {
  if (!taskId) return null;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.workerId !== workerId) return null;
  return task;
}

export async function startTask(
  actor: Actor,
  input: StartTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "WORKER");
  if (denied) return denied;

  const parsed = startTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const task = await loadOwnTask(parsed.data.taskId, actor.id);
  if (!task) return notFound("Task not found.");

  // A worker starts a job that's scheduled, or restarts one kicked back to
  // them as FLAGGED to rework it.
  if (task.status !== "SCHEDULED" && task.status !== "FLAGGED") {
    return badState("This job can't be started.");
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "IN_PROGRESS" },
  });
  return ok();
}

export async function submitTask(
  actor: Actor,
  input: SubmitTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "WORKER");
  if (denied) return denied;

  const parsed = submitTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, usage } = parsed.data;

  const task = await loadOwnTask(taskId, actor.id);
  if (!task) return notFound("Task not found.");
  if (task.status !== "IN_PROGRESS") {
    return badState("This task isn't in progress.");
  }

  // Stock decrements once, at the first submit. If this task was already
  // submitted before (then flagged and reworked), the material was counted
  // already — don't double-decrement. FLAGGED never reverses stock.
  const alreadyLogged = await hasLoggedMaterials(taskId);

  await prisma.$transaction(async (tx) => {
    if (!alreadyLogged) {
      await recordTaskMaterials(tx, taskId, usage);
    }
    await tx.task.update({
      where: { id: taskId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  });

  return ok();
}

/**
 * A worker flags they need more of a material — tied to a specific job or a
 * general restock. Creating the request never changes stock; that only happens
 * later through an actual RESTOCK once the material is received.
 */
export async function createMaterialRequest(
  actor: Actor,
  input: CreateMaterialRequestInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "WORKER");
  if (denied) return denied;

  const parsed = createMaterialRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  // If tied to a task, make sure it's the worker's own job.
  if (d.taskId) {
    const owned = await loadOwnTask(d.taskId, actor.id);
    if (!owned) return forbidden("That task isn't yours.");
  }

  const created = await prisma.materialRequest.create({
    data: {
      workerId: actor.id,
      materialId: d.materialId || null,
      description: d.description || null,
      quantityRequested: d.quantityRequested,
      taskId: d.taskId || null,
      urgent: d.urgent,
    },
  });
  return ok({ id: created.id });
}
