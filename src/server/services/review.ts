import { prisma } from "@/lib/prisma";
import { createBillForTask } from "@/lib/billing";
import { assertRole, type Actor } from "@/server/actor";
import {
  badState,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  approveTaskSchema,
  flagTaskSchema,
  type ApproveTaskInput,
  type FlagTaskInput,
} from "@/contracts/review";

export async function approveTask(
  actor: Actor,
  input: ApproveTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = approveTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId } = parsed.data;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return notFound("Task not found.");
  if (task.status !== "SUBMITTED") {
    return badState("This task is no longer awaiting review.");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: actor.id,
      // Clear any stale flag from a prior review round.
      flagReason: null,
    },
  });
  // A finished job is billable — generate its bill (pending payment).
  await createBillForTask(taskId);
  return ok();
}

export async function flagTask(
  actor: Actor,
  input: FlagTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = flagTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, reason } = parsed.data;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.status !== "SUBMITTED") {
    return badState("This task is no longer awaiting review.");
  }

  // FLAGGED kicks the job back to the worker. Per spec this does NOT reverse
  // any material usage — the material was still physically used; only the
  // billing/pricing was wrong.
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "FLAGGED", flagReason: reason },
  });
  return ok();
}
