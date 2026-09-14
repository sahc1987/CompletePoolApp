"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { str } from "@/lib/formData";
import * as reviewService from "@/server/services/review";
import type { ActionState } from "@/lib/actions";

function revalidateAll() {
  revalidatePath("/review");
  revalidatePath("/calendar");
  revalidatePath("/worker");
  revalidatePath("/billing");
}

export async function approveTask(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  await reviewService.approveTask(actor, { taskId: str(formData, "taskId") });
  revalidateAll();
}

export async function flagTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await reviewService.flagTask(actor, {
    taskId: str(formData, "taskId"),
    reason: str(formData, "reason"),
  });
  if (!res.ok) return { error: res.error };

  revalidateAll();
  return { ok: true };
}
