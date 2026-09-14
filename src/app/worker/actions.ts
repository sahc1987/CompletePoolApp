"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { parseMaterialUsage } from "@/lib/materials";
import { checkbox, opt, str } from "@/lib/formData";
import * as workerService from "@/server/services/worker";
import type { ActionState } from "@/lib/actions";

// Transport adapter only: authenticate, turn FormData into the service's input,
// and revalidate on the way out. The rules live in server/services/worker.ts so
// the REST API enforces exactly the same ones.

export async function startTask(formData: FormData): Promise<void> {
  const actor = await requireRole("WORKER");
  await workerService.startTask(actor, { taskId: str(formData, "taskId") });
  revalidatePath("/worker");
  revalidatePath("/calendar");
}

export async function submitTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("WORKER");
  const res = await workerService.submitTask(actor, {
    taskId: str(formData, "taskId"),
    usage: parseMaterialUsage(formData),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/worker");
  revalidatePath("/calendar");
  revalidatePath("/review");
  revalidatePath("/materials");
  return { ok: true };
}

export async function createMaterialRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("WORKER");
  const res = await workerService.createMaterialRequest(actor, {
    materialId: opt(formData, "materialId"),
    description: opt(formData, "description"),
    quantityRequested: str(formData, "quantityRequested"),
    taskId: opt(formData, "taskId"),
    urgent: checkbox(formData, "urgent"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/worker");
  revalidatePath("/materials");
  return { ok: true };
}
