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
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/timezone";
import { createBillForTask } from "@/lib/billing";
import {
  hasLoggedMaterials,
  recordTaskMaterials,
  reverseTaskMaterials,
} from "@/lib/materials";
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
  cancelTaskSchema,
  createTaskSchema,
  editTaskSchema,
  endSeriesSchema,
  finishTaskSchema,
  rescheduleTaskSchema,
  type CancelTaskInput,
  type CreateTaskInput,
  type EditTaskInput,
  type EndSeriesInput,
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

// The day alone, for notes about a whole series.
function fmtDay(d: Date, timeZone: string) {
  return d.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * A finished job is a billed record: its bill snapshotted the price, and its
 * photos are the evidence for it. Moving or repricing it afterwards would leave
 * the invoice disagreeing with the job, so it is closed to edits.
 */
function lockedReason(status: string): string | null {
  if (status === "APPROVED") {
    return "This job is finished and billed, so it can't be changed.";
  }
  if (status === "CANCELLED") return "This job was cancelled.";
  return null;
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
    select: { workerId: true, status: true },
  });
  if (!existing) return notFound("Task not found");
  const locked = lockedReason(existing.status);
  if (locked) return badState(locked);

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
  const locked = lockedReason(before.status);
  if (locked) return badState(locked);
  if (d.applyToSeries && !before.recurrenceRuleId) {
    return badState("This job isn't part of a repeating series.");
  }

  const hours = await getWorkHours();
  const tz = hours.timezone;
  const startTime = parseZonedDateTime(d.date, d.time, tz);
  if (!startTime) return invalid("Pick a valid date and start time");

  const hoursError = checkWorkHours(startTime, d.durationMin, hours);
  if (hoursError) return invalid(hoursError);

  // The rest of the series keeps its own dates and takes the new time of day,
  // rebuilt from wall-clock parts so a DST change doesn't shift it an hour.
  // Only jobs nobody has started yet follow along.
  const [hh, mm] = d.time.split(":").map(Number);
  const later =
    d.applyToSeries && before.recurrenceRuleId
      ? await prisma.task.findMany({
          where: {
            recurrenceRuleId: before.recurrenceRuleId,
            status: "SCHEDULED",
            startTime: { gt: before.startTime },
            id: { not: d.taskId },
          },
          select: { id: true, startTime: true },
          orderBy: { startTime: "asc" },
        })
      : [];
  const moves = later.map((t) => {
    const p = zonedParts(t.startTime, tz);
    return { id: t.id, startTime: zonedTimeToUtc(p.year, p.month, p.day, hh, mm, tz) };
  });

  // Every job being saved is checked against the worker it is being saved
  // with, which may differ from its current one.
  const targets = [{ id: d.taskId, startTime }, ...moves];
  for (const target of targets) {
    const clash = await findWorkerConflict({
      workerId: d.workerId,
      startTime: target.startTime,
      durationMin: d.durationMin,
      excludeTaskId: target.id,
      timezone: tz,
    });
    if (clash) {
      const worker = await prisma.user.findUnique({
        where: { id: d.workerId },
        select: { name: true },
      });
      const msg = conflictMessage(clash, worker?.name);
      return conflict(
        target.id === d.taskId ? msg : `On ${fmtDay(target.startTime, tz)}: ${msg}`
      );
    }
  }

  const shared = {
    workerId: d.workerId,
    serviceId: d.serviceId,
    durationMin: d.durationMin,
    price: d.price,
  };
  const updated = await prisma.$transaction(async (tx) => {
    for (const m of moves) {
      await tx.task.update({
        where: { id: m.id },
        data: { ...shared, startTime: m.startTime, date: zonedDayStart(m.startTime, tz) },
      });
    }
    return tx.task.update({
      where: { id: d.taskId },
      data: { ...shared, startTime, date: zonedDayStart(startTime, tz) },
      include: {
        client: { select: { name: true } },
        worker: { select: { name: true } },
        service: { select: { name: true } },
      },
    });
  });

  // Describe just what actually changed, for a useful notification.
  const changes: string[] = [];
  if (before.startTime.getTime() !== startTime.getTime())
    changes.push(`moved to ${fmt(startTime, hours.timezone)}`);
  if (before.service.name !== updated.service.name)
    changes.push(`service → ${updated.service.name}`);
  if (before.worker.name !== updated.worker.name)
    changes.push(`assigned to ${updated.worker.name}`);

  const series = moves.length
    ? ` (and ${moves.length} later job${moves.length === 1 ? "" : "s"} in the series)`
    : "";

  if (changes.length > 0) {
    await notifyRoles(
      ["ADMIN", "OWNER"],
      `${updated.client.name}'s job updated${series}: ${changes.join(", ")}.`,
      { link: "/calendar", exceptUserId: actor.id }
    );

    const reassigned = before.workerId !== updated.workerId;
    if (reassigned) {
      // Both sides of a handover need to know their day changed.
      await notifyUser(
        updated.workerId,
        `New job assigned${series}: ${updated.service.name} for ${updated.client.name} — ${fmt(startTime, hours.timezone)}.`,
        { link: "/worker" }
      );
      await notifyUser(
        before.workerId,
        `${updated.client.name}'s job on ${fmt(before.startTime, hours.timezone)}${series} was reassigned to ${updated.worker.name} and is off your list.`,
        { link: "/worker" }
      );
    } else {
      await notifyUser(
        updated.workerId,
        `Your job for ${updated.client.name} was updated${series}: ${changes.join(", ")}.`,
        { link: "/worker" }
      );
    }
  }

  return ok();
}

/**
 * Call off a job that hasn't been finished. Any material its worker already
 * logged goes back into stock, since the customer won't be billed for it.
 * A finished job has a bill and can't be cancelled.
 */
export async function cancelTask(
  actor: Actor,
  input: CancelTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = cancelTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId } = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { name: true } } },
  });
  if (!task) return notFound("Task not found");
  if (task.status === "APPROVED") {
    return badState("A finished job has already been billed and can't be cancelled.");
  }
  if (task.status === "CANCELLED") return badState("This job is already cancelled.");

  await prisma.$transaction(async (tx) => {
    await reverseTaskMaterials(tx, taskId);
    await tx.task.update({
      where: { id: taskId },
      data: { status: "CANCELLED" },
    });
  });

  const tz = (await getWorkHours()).timezone;
  await notifyUser(
    task.workerId,
    `${task.client.name}'s job on ${fmt(task.startTime, tz)} was cancelled and is off your list.`,
    { link: "/worker" }
  );
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${task.client.name}'s job on ${fmt(task.startTime, tz)} was cancelled.`,
    { link: "/calendar", exceptUserId: actor.id }
  );
  return ok();
}

/**
 * Stop a repeating job after this occurrence: the rule ends on this job's day,
 * so the cron won't create more, and the later jobs already created that no one
 * has started are cancelled.
 */
export async function endSeries(
  actor: Actor,
  input: EndSeriesInput
): Promise<ServiceResult<{ cancelled: number }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = endSeriesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId } = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { name: true } } },
  });
  if (!task) return notFound("Task not found");
  if (!task.recurrenceRuleId) {
    return badState("This job isn't part of a repeating series.");
  }

  const later = await prisma.task.findMany({
    where: {
      recurrenceRuleId: task.recurrenceRuleId,
      status: "SCHEDULED",
      startTime: { gt: task.startTime },
    },
    select: { id: true, workerId: true },
  });

  await prisma.$transaction([
    prisma.recurrenceRule.update({
      where: { id: task.recurrenceRuleId },
      data: { endDate: task.date },
    }),
    prisma.task.updateMany({
      where: { id: { in: later.map((t) => t.id) } },
      data: { status: "CANCELLED" },
    }),
  ]);

  const tz = (await getWorkHours()).timezone;
  const last = fmtDay(task.startTime, tz);
  const perWorker = new Map<string, number>();
  for (const t of later) perWorker.set(t.workerId, (perWorker.get(t.workerId) ?? 0) + 1);
  for (const [workerId, count] of perWorker) {
    await notifyUser(
      workerId,
      `${task.client.name}'s repeating job now ends on ${last}. ${count} upcoming job${count === 1 ? " was" : "s were"} taken off your list.`,
      { link: "/worker" }
    );
  }
  await notifyRoles(
    ["ADMIN", "OWNER"],
    `${task.client.name}'s repeating job now ends on ${last}.`,
    { link: "/calendar", exceptUserId: actor.id }
  );

  return ok({ cancelled: later.length });
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
  const { taskId, usage, override } = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { name: true } } },
  });
  if (!task) return notFound("Task not found");
  if (task.status === "APPROVED") return badState("This job is already finished.");
  if (task.status === "CANCELLED") return badState("This job was cancelled.");
  if (task.status !== "SUBMITTED" && !override) {
    return badState(
      "The worker hasn't submitted this job yet. Confirm that you want to finish it anyway."
    );
  }

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
