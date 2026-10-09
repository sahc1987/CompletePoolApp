import { prisma } from "@/lib/prisma";
import { paidAmount } from "@/lib/billing";
import { getWorkHours } from "@/lib/schedule";
import {
  addZonedDays,
  parseZonedDate,
  zonedDayKey,
  zonedWeekStart,
} from "@/lib/timezone";
import { assertRole, type Actor } from "@/server/actor";
import { requiredIso, requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";
import type {
  PaymentMethodValue,
  PaymentStatusValue,
  TaskStatusValue,
} from "@/contracts/enums";

/**
 * The mobile schedule: a Monday–Sunday strip with a job count per day, and the
 * chosen day's jobs in full.
 *
 * A phone can't run the web's FullCalendar grid, and must not work out dates
 * itself (its clock isn't the business's), so every day key, label and
 * neighbouring week comes from here. Visibility follows the calendar exactly:
 * a worker sees only their own jobs and no money; billing is admin-only.
 */

export type AgendaDay = {
  /** `YYYY-MM-DD`, business-local. */
  day: string;
  /** "Mon" */
  weekday: string;
  /** "8" */
  dateNum: string;
  count: number;
};

export type AgendaTask = {
  id: string;
  dayKey: string;
  start: string;
  /** "9:00 AM", in the business's zone. */
  timeLabel: string;
  endLabel: string;
  /** Business-local wall clock, `HH:MM` — what an edit form sends back. */
  time: string;
  durationMin: number;
  status: TaskStatusValue;
  clientName: string;
  poolAddress: string;
  serviceId: string;
  serviceName: string;
  workerId: string;
  workerName: string;
  notes: string | null;
  flagReason: string | null;
  /** Null for a worker — they never see money. */
  price: number | null;
  recurring: boolean;
  extras: string[];
  materialsUsed: { materialId: string; name: string; unit: string; quantityUsed: number }[];
  /** Admin only. */
  bill: {
    amount: number;
    paid: number;
    balance: number;
    status: PaymentStatusValue;
    method: PaymentMethodValue | null;
  } | null;
};

export type Agenda = {
  day: string;
  /** "Thursday, Oct 8" */
  dayLabel: string;
  today: string;
  prevWeek: string;
  nextWeek: string;
  week: AgendaDay[];
  tasks: AgendaTask[];
  /** Business hours, minutes from local midnight — bounds the time picker. */
  hours: { startMin: number; endMin: number };
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function hhmm(d: Date, timeZone: string): string {
  return d.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
}

export async function getAgenda(
  actor: Actor,
  day?: string
): Promise<ServiceResult<Agenda>> {
  const denied = assertRole(actor, "OWNER", "ADMIN", "WORKER");
  if (denied) return denied;

  const hours = await getWorkHours();
  const tz = hours.timezone;
  const today = zonedDayKey(new Date(), tz);
  const key = day && DAY_RE.test(day) ? day : today;
  const selected = parseZonedDate(key, tz) ?? parseZonedDate(today, tz)!;

  const weekStart = zonedWeekStart(selected, tz);
  const weekEnd = addZonedDays(weekStart, 7, tz);
  const isWorker = actor.role === "WORKER";
  const isAdmin = actor.role === "ADMIN";

  const tasks = await prisma.task.findMany({
    where: {
      startTime: { gte: weekStart, lt: weekEnd },
      status: { not: "CANCELLED" },
      ...(isWorker ? { workerId: actor.id } : {}),
    },
    include: {
      client: { select: { name: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
      extras: { include: { extraService: { select: { name: true } } } },
      materials: { include: { material: { select: { name: true, unit: true } } } },
      bill: { include: { payments: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const counts = new Map<string, number>();
  for (const t of tasks) {
    const k = zonedDayKey(t.startTime, tz);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const week: AgendaDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addZonedDays(weekStart, i, tz);
    const k = zonedDayKey(d, tz);
    return {
      day: k,
      weekday: d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" }),
      dateNum: d.toLocaleDateString("en-US", { timeZone: tz, day: "numeric" }),
      count: counts.get(k) ?? 0,
    };
  });

  const label = (d: Date) =>
    d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  const dayTasks = tasks
    .filter((t) => zonedDayKey(t.startTime, tz) === key)
    .map((t): AgendaTask => {
      const end = new Date(t.startTime.getTime() + t.durationMin * 60_000);
      const amount = t.bill ? requiredMoney(t.bill.amount) : 0;
      const paid = t.bill ? paidAmount(t.bill.payments) : 0;
      return {
        id: t.id,
        dayKey: key,
        start: requiredIso(t.startTime),
        timeLabel: label(t.startTime),
        endLabel: label(end),
        time: hhmm(t.startTime, tz),
        durationMin: t.durationMin,
        status: t.status as TaskStatusValue,
        clientName: t.client.name,
        poolAddress: t.pool.address,
        serviceId: t.serviceId,
        serviceName: t.service.name,
        workerId: t.workerId,
        workerName: t.worker.name,
        notes: t.notes,
        flagReason: t.flagReason,
        price: isWorker ? null : requiredMoney(t.price),
        recurring: t.recurrenceRuleId !== null,
        extras: t.extras.map((e) => e.extraService.name),
        materialsUsed: t.materials.map((m) => ({
          materialId: m.materialId,
          name: m.material.name,
          unit: m.material.unit,
          quantityUsed: requiredMoney(m.quantityUsed),
        })),
        bill:
          isAdmin && t.bill
            ? {
                amount,
                paid,
                balance: Math.round((amount - paid) * 100) / 100,
                status: t.bill.status as PaymentStatusValue,
                method: t.bill.method as PaymentMethodValue | null,
              }
            : null,
      };
    });

  return ok({
    day: key,
    dayLabel: selected.toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
    today,
    prevWeek: zonedDayKey(addZonedDays(weekStart, -7, tz), tz),
    nextWeek: zonedDayKey(weekEnd, tz),
    week,
    tasks: dayTasks,
    hours: { startMin: hours.startMin, endMin: hours.endMin },
  });
}

