"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { createBillForTask } from "@/lib/billing";
import type { ActionState } from "@/lib/actions";

function revalidateAll() {
  revalidatePath("/review");
  revalidatePath("/calendar");
  revalidatePath("/worker");
  revalidatePath("/billing");
}

export async function approveTask(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  const id = String(formData.get("taskId") ?? "");
  if (!id) return;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || task.status !== "SUBMITTED") return;

  await prisma.task.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: user.id,
      // Clear any stale flag from a prior review round.
      flagReason: null,
    },
  });
  // A finished job is billable — generate its bill (pending payment).
  await createBillForTask(id);
  revalidateAll();
}

const flagSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().trim().min(1, "Give a reason so the worker knows what to fix"),
});

export async function flagTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = flagSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const task = await prisma.task.findUnique({ where: { id: parsed.data.taskId } });
  if (!task || task.status !== "SUBMITTED") {
    return { error: "This task is no longer awaiting review." };
  }

  // FLAGGED kicks the job back to the worker. Per spec this does NOT reverse
  // any material usage — the material was still physically used; only the
  // billing/pricing was wrong.
  await prisma.task.update({
    where: { id: parsed.data.taskId },
    data: { status: "FLAGGED", flagReason: parsed.data.reason },
  });
  revalidateAll();
  return { ok: true };
}
