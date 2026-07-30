import { Frequency } from "@prisma/client";
import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}
function wholeWeeksBetween(a: Date, b: Date): number {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / (7 * DAY_MS));
}

// Does this rule fire on the given calendar day?
function occursOn(
  rule: { frequency: Frequency; daysOfWeek: number[]; startDate: Date },
  day: Date
): boolean {
  const dow = day.getDay();
  switch (rule.frequency) {
    case "DAILY":
      return true;
    case "WEEKLY":
      return rule.daysOfWeek.includes(dow);
    case "BIWEEKLY":
      // Fires on the chosen weekday(s), every other week relative to startDate.
      return rule.daysOfWeek.includes(dow) && wholeWeeksBetween(rule.startDate, day) % 2 === 0;
    case "MONTHLY":
      return day.getDate() === rule.startDate.getDate();
    default:
      return false;
  }
}

// Expand every recurrence rule into concrete SCHEDULED tasks across a rolling
// window (default 30 days). Idempotent: a day that already has a task for the
// rule is skipped, so it's safe to run repeatedly (cron, button, on-create).
// Each rule copies job details from its earliest task (the template).
export async function expandRecurrences(windowDays = 30): Promise<number> {
  const today = startOfDay(new Date());
  const windowEnd = addDays(today, windowDays);

  const rules = await prisma.recurrenceRule.findMany({
    include: { tasks: { orderBy: { startTime: "asc" } } },
  });

  let created = 0;

  for (const rule of rules) {
    const template = rule.tasks[0];
    if (!template) continue; // no template job to copy from

    const ruleEnd =
      rule.endDate && rule.endDate < windowEnd ? startOfDay(rule.endDate) : windowEnd;
    const existingDays = new Set(rule.tasks.map((t) => dayKey(t.date)));

    const hours = template.startTime.getHours();
    const minutes = template.startTime.getMinutes();

    let cursor = startOfDay(rule.startDate);
    if (cursor < today) cursor = today;

    const toCreate: { date: Date; startTime: Date }[] = [];
    while (cursor <= ruleEnd) {
      if (occursOn(rule, cursor) && !existingDays.has(dayKey(cursor))) {
        const startTime = new Date(cursor);
        startTime.setHours(hours, minutes, 0, 0);
        toCreate.push({ date: startOfDay(cursor), startTime });
        existingDays.add(dayKey(cursor));
      }
      cursor = addDays(cursor, 1);
    }

    for (const occ of toCreate) {
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
        },
      });
      created++;
    }
  }

  return created;
}
