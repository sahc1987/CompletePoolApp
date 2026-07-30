"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { notifyAll, notifyUser, notifyRoles } from "@/lib/notify";
import {
  getWorkHours,
  checkWorkHours,
  findWorkerConflict,
  conflictMessage,
} from "@/lib/schedule";
import { createBillForTask, recordPayment } from "@/lib/billing";
import type { ActionState } from "@/lib/actions";

function fmt(d: Date) {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Drag / resize a task on the calendar — persist the new start + duration.
// Called directly (not via a form) from FullCalendar's eventDrop/eventResize.
export async function rescheduleTask(
  taskId: string,
  startISO: string,
  durationMin: number
): Promise<{ error?: string }> {
  const actor = await requireRole("ADMIN");
  if (!taskId || !startISO) return { error: "Missing data" };
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return { error: "Invalid date" };
  const minutes = Math.max(5, Math.round(durationMin));

  // The drop target has to obey the same rules as the form; the calendar
  // reverts the drag when this returns an error.
  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { workerId: true },
  });
  if (!existing) return { error: "Task not found" };

  const hoursError = checkWorkHours(start, minutes, await getWorkHours());
  if (hoursError) return { error: hoursError };

  const clash = await findWorkerConflict({
    workerId: existing.workerId,
    startTime: start,
    durationMin: minutes,
    excludeTaskId: taskId,
  });
  if (clash) return { error: conflictMessage(clash) };

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      startTime: start,
      date: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      durationMin: minutes,
    },
    include: { client: { select: { name: true } } },
  });

  // The worker whose day just changed gets told directly; managers get the
  // team-wide view. Unrelated workers are no longer pinged.
  await notifyUser(
    updated.workerId,
    `Your job for ${updated.client.name} moved to ${fmt(start)}.`,
    { link: "/worker" }
  );
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${updated.client.name}'s job was rescheduled to ${fmt(start)}.`,
    { link: "/calendar", exceptUserId: actor.id }
  );
  revalidatePath("/calendar");
  return {};
}

const editSchema = z.object({
  taskId: z.string().min(1),
  workerId: z.string().min(1, "Pick a worker"),
  serviceId: z.string().min(1, "Pick a service"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  durationMin: z.coerce.number().int().positive("Duration must be positive"),
  price: z.coerce.number().nonnegative("Price can't be negative"),
});

// Full edit from the calendar's task modal: reschedule, change service,
// reassign the worker, and adjust duration/price. Notifies everyone of what
// changed.
export async function editTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  const before = await prisma.task.findUnique({
    where: { id: d.taskId },
    include: {
      worker: { select: { name: true } },
      service: { select: { name: true } },
    },
  });
  if (!before) return { error: "Task not found" };

  const startTime = new Date(`${d.date}T${d.time}:00`);

  const hoursError = checkWorkHours(startTime, d.durationMin, await getWorkHours());
  if (hoursError) return { error: hoursError };

  // Checked against the worker the job is being saved with, which may differ
  // from its current one.
  const clash = await findWorkerConflict({
    workerId: d.workerId,
    startTime,
    durationMin: d.durationMin,
    excludeTaskId: d.taskId,
  });
  if (clash) {
    const worker = await prisma.user.findUnique({
      where: { id: d.workerId },
      select: { name: true },
    });
    return { error: conflictMessage(clash, worker?.name) };
  }

  const updated = await prisma.task.update({
    where: { id: d.taskId },
    data: {
      workerId: d.workerId,
      serviceId: d.serviceId,
      startTime,
      date: new Date(`${d.date}T00:00:00`),
      durationMin: d.durationMin,
      price: d.price,
    },
    include: {
      client: { select: { name: true } },
      worker: { select: { name: true } },
      service: { select: { name: true } },
    },
  });

  // Describe just what actually changed, for a useful notification.
  const changes: string[] = [];
  if (before.startTime.getTime() !== startTime.getTime())
    changes.push(`moved to ${fmt(startTime)}`);
  if (before.service.name !== updated.service.name)
    changes.push(`service → ${updated.service.name}`);
  if (before.worker.name !== updated.worker.name)
    changes.push(`assigned to ${updated.worker.name}`);

  if (changes.length > 0) {
    await notifyRoles(
      ["ADMIN", "OWNER"],
      `${updated.client.name}'s job updated: ${changes.join(", ")}.`,
      { link: "/calendar", exceptUserId: actor.id }
    );

    const reassigned = before.workerId !== updated.workerId;
    if (reassigned) {
      // Both sides of a handover need to know their day changed.
      await notifyUser(
        updated.workerId,
        `New job assigned: ${updated.service.name} for ${updated.client.name} — ${fmt(
          startTime
        )}.`,
        { link: "/worker" }
      );
      await notifyUser(
        before.workerId,
        `${updated.client.name}'s job on ${fmt(
          before.startTime
        )} was reassigned to ${updated.worker.name} and is off your list.`,
        { link: "/worker" }
      );
    } else {
      await notifyUser(
        updated.workerId,
        `Your job for ${updated.client.name} was updated: ${changes.join(", ")}.`,
        { link: "/worker" }
      );
    }
  }

  revalidatePath("/calendar");
  return { ok: true };
}

// Finish a job straight from the calendar: mark it APPROVED (billable) and
// generate its bill. This is an admin override of the normal
// worker-submit -> review path, for jobs the admin closes out themselves.
export async function finishTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return { error: "Missing task" };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { name: true } } },
  });
  if (!task) return { error: "Task not found" };
  if (task.status === "APPROVED") return { error: "This job is already finished." };
  if (task.status === "CANCELLED") return { error: "This job was cancelled." };

  const now = new Date();
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "APPROVED",
      approvedAt: now,
      approvedById: actor.id,
      submittedAt: task.submittedAt ?? now,
      flagReason: null,
    },
  });
  await createBillForTask(taskId);

  await notifyAll(`${task.client.name}'s job was finished and billed.`, {
    link: "/billing",
    exceptUserId: actor.id,
  });

  revalidatePath("/calendar");
  revalidatePath("/review");
  revalidatePath("/worker");
  revalidatePath("/billing");
  return { ok: true };
}

const chargeSchema = z.object({
  taskId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount greater than $0"),
  method: z.enum(["CASH", "CHECK", "ONLINE"]),
  checkNumber: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

// Take payment for a finished job without leaving the calendar. Supports
// partial payments; check/card details are captured and validated centrally.
export async function chargeTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("ADMIN");
  const parsed = chargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { taskId, ...payment } = parsed.data;

  const bill =
    (await prisma.bill.findUnique({ where: { taskId } })) ??
    (await createBillForTask(taskId));
  if (!bill) return { error: "No bill for this job yet." };

  const res = await recordPayment({ billId: bill.id, ...payment, userId: user.id });
  if (res.error) return { error: res.error };

  revalidatePath("/calendar");
  revalidatePath("/billing");
  return { ok: true };
}
