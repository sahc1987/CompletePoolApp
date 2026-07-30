"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { expandRecurrences } from "@/lib/recurrence";
import { notifyUser, notifyRoles } from "@/lib/notify";
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

const REPEAT_LABEL: Record<string, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "every 2 weeks",
  MONTHLY: "monthly",
};

const schema = z.object({
  clientId: z.string().min(1, "Pick a client"),
  poolId: z.string().min(1, "Pick a pool"),
  workerId: z.string().min(1, "Pick a worker"),
  serviceId: z.string().min(1, "Pick a service"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  durationMin: z.coerce.number().int().positive("Duration must be positive"),
  price: z.coerce.number().nonnegative("Price can't be negative"),
  notes: z.string().trim().optional(),
  repeat: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).default("NONE"),
  repeatEndDate: z.string().optional(),
});

export async function createTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  // Guard against a pool that doesn't belong to the chosen client.
  const pool = await prisma.pool.findUnique({ where: { id: d.poolId } });
  if (!pool || pool.clientId !== d.clientId) {
    return { error: "That pool doesn't belong to the selected client." };
  }

  const startTime = new Date(`${d.date}T${d.time}:00`);
  const extraIds = formData.getAll("extras").map(String).filter(Boolean);

  // Snapshot each extra's current price onto the task line.
  const extras = extraIds.length
    ? await prisma.extraService.findMany({ where: { id: { in: extraIds } } })
    : [];

  // Optional recurrence: create a rule and link this task as its template.
  let recurrenceRuleId: string | null = null;
  if (d.repeat !== "NONE") {
    const selectedDows = formData
      .getAll("daysOfWeek")
      .map((v) => Number(v))
      .filter((n) => n >= 0 && n <= 6);
    // Weekly/biweekly need weekdays; default to the task's own weekday.
    const daysOfWeek =
      d.repeat === "WEEKLY" || d.repeat === "BIWEEKLY"
        ? selectedDows.length > 0
          ? selectedDows
          : [new Date(`${d.date}T00:00:00`).getDay()]
        : [];
    const rule = await prisma.recurrenceRule.create({
      data: {
        frequency: d.repeat,
        daysOfWeek,
        startDate: new Date(`${d.date}T00:00:00`),
        endDate: d.repeatEndDate ? new Date(`${d.repeatEndDate}T00:00:00`) : null,
      },
    });
    recurrenceRuleId = rule.id;
  }

  const task = await prisma.task.create({
    data: {
      clientId: d.clientId,
      poolId: d.poolId,
      workerId: d.workerId,
      serviceId: d.serviceId,
      date: new Date(`${d.date}T00:00:00`),
      startTime,
      durationMin: d.durationMin,
      price: d.price,
      notes: d.notes || null,
      status: "SCHEDULED",
      recurrenceRuleId,
      extras: {
        create: extras.map((e) => ({
          extraServiceId: e.id,
          priceAtTimeOfSale: e.price,
        })),
      },
    },
    include: {
      client: { select: { name: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
    },
  });

  // Tell the worker the job is theirs — until now assignment was silent.
  const repeats = d.repeat !== "NONE" ? `, repeats ${REPEAT_LABEL[d.repeat]}` : "";
  await notifyUser(
    d.workerId,
    `New job assigned: ${task.service.name} for ${task.client.name} — ${fmt(
      task.startTime
    )} at ${task.pool.address}${repeats}.`,
    { link: "/worker" }
  );
  // Managers track team workload; the assigning admin already knows.
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${task.worker.name} was assigned ${task.client.name}'s job on ${fmt(
      task.startTime
    )}${repeats}.`,
    { link: "/calendar", exceptUserId: actor.id }
  );

  // Immediately fill the rolling window so the calendar shows future dates.
  if (recurrenceRuleId) await expandRecurrences();

  revalidatePath("/calendar");
  revalidatePath("/assign");
  redirect("/calendar");
}

// Admin-triggered (and cron-callable) expansion of all recurrence rules into
// concrete tasks across the rolling window.
export async function runRecurrenceExpansion(): Promise<void> {
  await requireRole("ADMIN");
  await expandRecurrences();
  revalidatePath("/calendar");
  revalidatePath("/assign");
}
