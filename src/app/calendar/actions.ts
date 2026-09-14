"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { parseMaterialUsage } from "@/lib/materials";
import { opt, str } from "@/lib/formData";
import * as billingService from "@/server/services/billing";
import * as scheduling from "@/server/services/scheduling";
import type { ActionState } from "@/lib/actions";

// Drag / resize a task on the calendar. Called directly (not via a form) from
// FullCalendar's eventDrop/eventResize, so it keeps its positional signature
// and its bare `{ error }` return — the calendar reverts the drag on an error.
export async function rescheduleTask(
  taskId: string,
  startISO: string,
  durationMin: number
): Promise<{ error?: string }> {
  const actor = await requireRole("ADMIN");
  const res = await scheduling.rescheduleTask(actor, {
    taskId,
    startISO,
    durationMin,
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/calendar");
  return {};
}

export async function editTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await scheduling.editTask(actor, {
    taskId: str(formData, "taskId"),
    workerId: str(formData, "workerId"),
    serviceId: str(formData, "serviceId"),
    date: str(formData, "date"),
    time: str(formData, "time"),
    durationMin: str(formData, "durationMin"),
    price: str(formData, "price"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/calendar");
  return { ok: true };
}

export async function finishTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await scheduling.finishTask(actor, {
    taskId: str(formData, "taskId"),
    usage: parseMaterialUsage(formData),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/calendar");
  revalidatePath("/review");
  revalidatePath("/worker");
  revalidatePath("/billing");
  // Finishing can now move stock, so inventory has to refresh too.
  revalidatePath("/materials");
  return { ok: true };
}

// Take payment for a finished job without leaving the calendar. Supports
// partial payments; check/card details are captured and validated centrally.
export async function chargeTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await billingService.chargeTask(actor, {
    taskId: str(formData, "taskId"),
    amount: str(formData, "amount"),
    method: str(formData, "method"),
    checkNumber: opt(formData, "checkNumber"),
    billingAddress: opt(formData, "billingAddress"),
    note: opt(formData, "note"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/calendar");
  revalidatePath("/billing");
  return { ok: true };
}
