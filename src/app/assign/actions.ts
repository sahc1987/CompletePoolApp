"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { many, opt, str } from "@/lib/formData";
import * as scheduling from "@/server/services/scheduling";
import type { ActionState } from "@/lib/actions";

export async function createTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await scheduling.createTask(actor, {
    clientId: str(formData, "clientId"),
    poolId: str(formData, "poolId"),
    workerId: str(formData, "workerId"),
    serviceId: str(formData, "serviceId"),
    date: str(formData, "date"),
    time: str(formData, "time"),
    durationMin: str(formData, "durationMin"),
    price: str(formData, "price"),
    notes: opt(formData, "notes"),
    extras: many(formData, "extras"),
    repeat: str(formData, "repeat") || "NONE",
    daysOfWeek: many(formData, "daysOfWeek").map(Number),
    repeatEndDate: opt(formData, "repeatEndDate"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/calendar");
  revalidatePath("/assign");
  redirect("/calendar");
}

// Admin-triggered (and cron-callable) expansion of all recurrence rules into
// concrete tasks across the rolling window.
export async function runRecurrenceExpansion(): Promise<void> {
  const actor = await requireRole("ADMIN");
  await scheduling.runRecurrenceExpansion(actor);
  revalidatePath("/calendar");
  revalidatePath("/assign");
}
