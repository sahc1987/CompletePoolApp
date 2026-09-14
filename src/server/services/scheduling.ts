import { prisma } from "@/lib/prisma";
import { expandRecurrences } from "@/lib/recurrence";
import { notifyAll, notifyRoles, notifyUser } from "@/lib/notify";
import {
  checkWorkHours,
  conflictMessage,
  findWorkerConflict,
  getWorkHours,
} from "@/lib/schedule";
import {
  parseZonedDate,
  parseZonedDateTime,
  zonedDayOfWeek,
  zonedDayStart,
} from "@/lib/timezone";
import { createBillForTask } from "@/lib/billing";
import { hasLoggedMaterials, recordTaskMaterials } from "@/lib/materials";
import { assertRole, type Actor } from "@/server/actor";
import {
  badState,
  conflict,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  createTaskSchema,
  editTaskSchema,
  finishTaskSchema,
  rescheduleTaskSchema,
  type CreateTaskInput,
  type EditTaskInput,
  type FinishTaskInput,
  type RescheduleTaskInput,
} from "@/contracts/scheduling";

// Notification text must read in the crews' clock, not the server's.
function fmt(d: Date, timeZone: string) {
  return d.toLocaleString("en-US", {
    timeZone,
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

export async function createTask(
  actor: Actor,
  input: CreateTaskInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  // Guard against a pool that doesn't belong to the chosen client.
  const pool = await prisma.pool.findUnique({ where: { id: d.poolId } });
  if (!pool || pool.clientId !== d.clientId) {
    return invalid("That pool doesn't belong to the selected client.");
  }

  // Interpreted in the business timezone, not the server's — Vercel runs UTC,
  // which previously shifted every job by the UTC offset.
  const hours = await getWorkHours();
  const startTime = parseZonedDateTime(d.date, d.time, hours.timezone);
  if (!startTime) return invalid("Pick a valid date and start time");

  const hoursError = checkWorkHours(startTime, d.durationMin, hours);
  if (hoursError) return invalid(hoursError);

  const clash = await findWorkerConflict({
    workerId: d.workerId,
    startTime,
    durationMin: d.durationMin,
    timezone: hours.timezone,
  });
  if (clash) {
    const worker = await prisma.user.findUnique({
      where: { id: d.workerId },
      select: { name: true },
    });
    return conflict(conflictMessage(clash, worker?.name));
  }

  // Snapshot each extra's current price onto the task line.
  const extras = d.extras.length
    ? await prisma.extraService.findMany({ where: { id: { in: d.extras } } })
    : [];

  // Optional recurrence: create a rule and link this task as its template.
  let recurrenceRuleId: string | null = null;
  if (d.repeat !== "NONE") {
    // Weekly/biweekly need weekdays; default to the task's own weekday.
    const daysOfWeek =
      d.repeat === "WEEKLY" || d.repeat === "BIWEEKLY"
        ? d.daysOfWeek.length > 0
          ? d.daysOfWeek
          : [zonedDayOfWeek(startTime, hours.timezone)]
        : [];
    const rule = await prisma.recurrenceRule.create({
      data: {
        frequency: d.repeat as "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
        daysOfWeek,
        startDate: zonedDayStart(startTime, hours.timezone),
        endDate: d.repeatEndDate
          ? parseZonedDate(d.repeatEndDate, hours.timezone)
          : null,
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
      date: zonedDayStart(startTime, hours.timezone),
      startTime,
      durationMin: d.durationMin,
      price: d.price,
      notes: d.notes ?? null,
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
  const repeats =
    d.repeat !== "NONE" ? `, repeats ${REPEAT_LABEL[d.repeat]}` : "";
  await notifyUser(
    d.workerId,
    `New job assigned: ${task.service.name} for ${task.client.name} — ${fmt(task.startTime, hours.timezone)} at ${task.pool.address}${repeats}.`,
    { link: "/worker" }
  );
  // Managers track team workload; the assigning admin already knows.
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${task.worker.name} was assigned ${task.client.name}'s job on ${fmt(task.startTime, hours.timezone)}${repeats}.`,
    { link: "/calendar", exceptUserId: actor.id }
  );

  // Immediately fill the rolling window so the calendar shows future dates.
  if (recurrenceRuleId) await expandRecurrences();

  return ok({ id: task.id });
}

/**
 * Expand all recurrence rules into concrete tasks across the rolling window.
 * Admin-triggered, and also reached by the cron endpoint.
 */
export async function runRecurrenceExpansion(
  actor: Actor
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;
  await expandRecurrences();
  return ok();
}

export async function rescheduleTask(
  actor: Actor,
  input: RescheduleTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = rescheduleTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, startISO } = parsed.data;

  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return invalid("Invalid date");
  const minutes = Math.max(5, Math.round(parsed.data.durationMin));

  // The drop target has to obey the same rules as the form; the calendar
  // reverts the drag when this returns an error.
  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { workerId: true },
  });
  if (!existing) return notFound("Task not found");

  const hours = await getWorkHours();
  const hoursError = checkWorkHours(start, minutes, hours);
  if (hoursError) return invalid(hoursError);

  const clash = await findWorkerConflict({
    workerId: existing.workerId,
    startTime: start,
    durationMin: minutes,
    excludeTaskId: taskId,
    timezone: hours.timezone,
  });
  if (clash) return conflict(conflictMessage(clash));

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      startTime: start,
      date: zonedDayStart(start, hours.timezone),
      durationMin: minutes,
    },
    include: { client: { select: { name: true } } },
  });

  // The worker whose day just changed gets told directly; managers get the
  // team-wide view. Unrelated workers are no longer pinged.
  await notifyUser(
    updated.workerId,
    `Your job for ${updated.client.name} moved to ${fmt(start, hours.timezone)}.`,
    { link: "/worker" }
  );
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${updated.client.name}'s job was rescheduled to ${fmt(start, hours.timezone)}.`,
    { link: "/calendar", exceptUserId: actor.id }
  );
  return ok();
}

/**
 * Full edit from the calendar's task modal: reschedule, change service,
 * reassign the worker, and adjust duration/price. Notifies everyone of what
 * changed.
 */
export async function editTask(
  actor: Actor,
  input: EditTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = editTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const d = parsed.data;

  const before = await prisma.task.findUnique({
    where: { id: d.taskId },
    include: {
      worker: { select: { name: true } },
      service: { select: { name: true } },
    },
  });
  if (!before) return notFound("Task not found");

  const hours = await getWorkHours();
  const startTime = parseZonedDateTime(d.date, d.time, hours.timezone);
  if (!startTime) return invalid("Pick a valid date and start time");

  const hoursError = checkWorkHours(startTime, d.durationMin, hours);
  if (hoursError) return invalid(hoursError);

  // Checked against the worker the job is being saved with, which may differ
  // from its current one.
  const clash = await findWorkerConflict({
    workerId: d.workerId,
    startTime,
    durationMin: d.durationMin,
    excludeTaskId: d.taskId,
    timezone: hours.timezone,
  });
  if (clash) {
    const worker = await prisma.user.findUnique({
      where: { id: d.workerId },
      select: { name: true },
    });
    return conflict(conflictMessage(clash, worker?.name));
  }

  const updated = await prisma.task.update({
    where: { id: d.taskId },
    data: {
      workerId: d.workerId,
      serviceId: d.serviceId,
      startTime,
      date: zonedDayStart(startTime, hours.timezone),
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
    changes.push(`moved to ${fmt(startTime, hours.timezone)}`);
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
        `New job assigned: ${updated.service.name} for ${updated.client.name} — ${fmt(startTime, hours.timezone)}.`,
        { link: "/worker" }
      );
      await notifyUser(
        before.workerId,
        `${updated.client.name}'s job on ${fmt(before.startTime, hours.timezone)} was reassigned to ${updated.worker.name} and is off your list.`,
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

  return ok();
}

/**
 * Finish a job straight from the calendar: mark it APPROVED (billable) and
 * generate its bill. This is an admin override of the normal
 * worker-submit -> review path, for jobs the admin closes out themselves.
 */
export async function finishTask(
  actor: Actor,
  input: FinishTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = finishTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, usage } = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { name: true } } },
  });
  if (!task) return notFound("Task not found");
  if (task.status === "APPROVED") return badState("This job is already finished.");
  if (task.status === "CANCELLED") return badState("This job was cancelled.");

  // A job that already went through the worker's submit has its usage counted;
  // entering it again here would drain stock twice and double-bill the customer.
  const alreadyLogged = await hasLoggedMaterials(taskId);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (!alreadyLogged) {
      await recordTaskMaterials(tx, taskId, usage);
    }
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: "APPROVED",
        approvedAt: now,
        approvedById: actor.id,
        submittedAt: task.submittedAt ?? now,
        flagReason: null,
      },
    });
  });

  // After the transaction commits: the bill totals the material rows written
  // above, so it has to see them.
  await createBillForTask(taskId);

  await notifyAll(`${task.client.name}'s job was finished and billed.`, {
    link: "/billing",
    exceptUserId: actor.id,
  });

  return ok();
}
