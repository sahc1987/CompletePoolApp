"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import {
  parseMaterialUsage,
  hasLoggedMaterials,
  recordTaskMaterials,
} from "@/lib/materials";
import type { ActionState } from "@/lib/actions";

// Load a task and confirm it belongs to the signed-in worker. Returns null
// if it isn't theirs — a worker can only ever move their own jobs.
async function loadOwnTask(taskId: string, workerId: string) {
  if (!taskId) return null;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.workerId !== workerId) return null;
  return task;
}

export async function startTask(formData: FormData): Promise<void> {
  const user = await requireRole("WORKER");
  const task = await loadOwnTask(String(formData.get("taskId") ?? ""), user.id);
  if (!task) return;
  // A worker starts a job that's scheduled, or restarts one kicked back to
  // them as FLAGGED to rework it.
  if (task.status !== "SCHEDULED" && task.status !== "FLAGGED") return;

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "IN_PROGRESS" },
  });
  revalidatePath("/worker");
  revalidatePath("/calendar");
}

export async function submitTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("WORKER");
  const taskId = String(formData.get("taskId") ?? "");
  const task = await loadOwnTask(taskId, user.id);
  if (!task) return { error: "Task not found." };
  if (task.status !== "IN_PROGRESS") return { error: "This task isn't in progress." };

  const usage = parseMaterialUsage(formData);

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

  revalidatePath("/worker");
  revalidatePath("/calendar");
  revalidatePath("/review");
  revalidatePath("/materials");
  return { ok: true };
}

const requestSchema = z
  .object({
    materialId: z.string().optional(),
    description: z.string().trim().optional(),
    quantityRequested: z.coerce.number().positive("Quantity must be greater than zero"),
    taskId: z.string().optional(),
    urgent: z.string().optional(),
  })
  .refine((d) => (d.materialId && d.materialId.length > 0) || (d.description && d.description.length > 0), {
    message: "Pick a catalog material or describe what you need",
  });

// A worker flags they need more of a material — tied to a specific job or a
// general restock. Creating the request never changes stock; that only
// happens later through an actual RESTOCK once the material is received.
export async function createMaterialRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("WORKER");
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  // If tied to a task, make sure it's the worker's own job.
  if (d.taskId) {
    const owned = await loadOwnTask(d.taskId, user.id);
    if (!owned) return { error: "That task isn't yours." };
  }

  await prisma.materialRequest.create({
    data: {
      workerId: user.id,
      materialId: d.materialId || null,
      description: d.description || null,
      quantityRequested: d.quantityRequested,
      taskId: d.taskId || null,
      urgent: d.urgent === "on",
    },
  });
  revalidatePath("/worker");
  revalidatePath("/materials");
  return { ok: true };
}
