import { Frequency } from "@prisma/client";
import { prisma } from "./prisma";
import { findWorkerConflict, getBusinessTimezone } from "./schedule";
import { notifyRoles } from "./notify";
import {
  zonedDayStart,
  addZonedDays,
  zonedDayKey,
  zonedDayOfWeek,
  zonedParts,
  zonedTimeToUtc,
} from "./timezone";

const DAY_MS = 24 * 60 * 60 * 1000;

function wholeWeeksBetween(a: Date, b: Date, tz: string): number {
  const ms = zonedDayStart(b, tz).getTime() - zonedDayStart(a, tz).getTime();
  return Math.floor(ms / (7 * DAY_MS));
}

// Does this rule fire on the given calendar day, read in the business zone?
function occursOn(
  rule: { frequency: Frequency; daysOfWeek: number[]; startDate: Date },
  day: Date,
  tz: string
): boolean {
  switch (rule.frequency) {
    case "DAILY":
      return true;
    case "WEEKLY":
      return rule.daysOfWeek.includes(zonedDayOfWeek(day, tz));
    case "BIWEEKLY":
      // Fires on the chosen weekday(s), every other week relative to startDate.
      return (
        rule.daysOfWeek.includes(zonedDayOfWeek(day, tz)) &&
        wholeWeeksBetween(rule.startDate, day, tz) % 2 === 0
      );
    case "MONTHLY": {
      // A series started on the 31st still runs in a 30-day month (or
      // February): it falls on that month's last day instead of skipping it.
      const d = zonedParts(day, tz);
      const lastDay = new Date(Date.UTC(d.year, d.month, 0)).getUTCDate();
      return d.day === Math.min(zonedParts(rule.startDate, tz).day, lastDay);
    }
    default:
      return false;
  }
}

// Expand every recurrence rule into concrete SCHEDULED tasks across a rolling
// window (default 30 days). Idempotent: a day that already has a task for the
// rule is skipped, so it's safe to run repeatedly (cron, button, on-create).
//
// Each rule copies job details — worker, service, time, price, add-ons — from
// its latest job that wasn't cancelled. Editing "this and all later jobs" in
// the calendar updates that latest job too, so new occurrences pick the change
// up instead of reverting to whatever the first job looked like.
export async function expandRecurrences(windowDays = 30): Promise<number> {
  const tz = await getBusinessTimezone();
  const today = zonedDayStart(new Date(), tz);
  const windowEnd = addZonedDays(today, windowDays, tz);

  const rules = await prisma.recurrenceRule.findMany({
    include: {
      tasks: {
        orderBy: { startTime: "asc" },
        include: {
          extras: true,
          client: { select: { name: true } },
          worker: { select: { name: true } },
        },
      },
    },
  });

  let created = 0;
  // New jobs aren't refused for a clash the way a hand-made one is — the cron
  // has no one to show an error to. They're created, and the managers are told
  // so they can move one.
  const clashes: string[] = [];

  for (const rule of rules) {
    const live = rule.tasks.filter((t) => t.status !== "CANCELLED");
    const template = live[live.length - 1];
    if (!template) continue; // no template job to copy from

    const ruleEnd =
      rule.endDate && rule.endDate < windowEnd
        ? zonedDayStart(rule.endDate, tz)
        : windowEnd;
    const existingDays = new Set(rule.tasks.map((t) => zonedDayKey(t.date, tz)));

    // The template's time of day, as the crews read it.
    const tpl = zonedParts(template.startTime, tz);

    let cursor = zonedDayStart(rule.startDate, tz);
    if (cursor < today) cursor = today;

    const toCreate: { date: Date; startTime: Date }[] = [];
    while (cursor <= ruleEnd) {
      const key = zonedDayKey(cursor, tz);
      if (occursOn(rule, cursor, tz) && !existingDays.has(key)) {
        const c = zonedParts(cursor, tz);
        // Rebuilt from wall-clock parts so the job keeps its local start time
        // across a DST change rather than drifting by an hour.
        const startTime = zonedTimeToUtc(
          c.year,
          c.month,
          c.day,
          tpl.hour,
          tpl.minute,
          tz
        );
        toCreate.push({ date: zonedDayStart(cursor, tz), startTime });
        existingDays.add(key);
      }
      cursor = addZonedDays(cursor, 1, tz);
    }

    for (const occ of toCreate) {
      const clash = await findWorkerConflict({
        workerId: template.workerId,
        startTime: occ.startTime,
        durationMin: template.durationMin,
        timezone: tz,
      });
      if (clash) {
        clashes.push(
          `${template.worker.name} on ${zonedDayKey(occ.startTime, tz)} (${template.client.name}, overlaps ${clash.clientName} ${clash.startLabel}–${clash.endLabel})`
        );
      }

      await prisma.task.create({
        data: {
          clientId: template.clientId,
          poolId: template.poolId,
          workerId: template.workerId,
          serviceId: template.serviceId,
          date: occ.date,
          startTime: occ.startTime,
          durationMin: template.durationMin,
          price: template.price,
          status: "SCHEDULED",
          recurrenceRuleId: rule.id,
          // Add-ons are part of the job the customer signed up for, priced as
          // they were on the template rather than at today's catalog price.
          extras: {
            create: template.extras.map((e) => ({
              extraServiceId: e.extraServiceId,
              priceAtTimeOfSale: e.priceAtTimeOfSale,
            })),
          },
        },
      });
      created++;
    }
  }

  if (clashes.length > 0) {
    await notifyRoles(
      ["ADMIN"],
      `Repeating jobs were double-booked and need moving: ${clashes.join("; ")}.`,
      { link: "/calendar" }
    );
  }

  return created;
}
