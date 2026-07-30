import { Frequency } from "@prisma/client";
import { prisma } from "./prisma";
import { getBusinessTimezone } from "./schedule";
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
    case "MONTHLY":
      return zonedParts(day, tz).day === zonedParts(rule.startDate, tz).day;
    default:
      return false;
  }
}

// Expand every recurrence rule into concrete SCHEDULED tasks across a rolling
// window (default 30 days). Idempotent: a day that already has a task for the
// rule is skipped, so it's safe to run repeatedly (cron, button, on-create).
// Each rule copies job details from its earliest task (the template).
export async function expandRecurrences(windowDays = 30): Promise<number> {
  const tz = await getBusinessTimezone();
  const today = zonedDayStart(new Date(), tz);
  const windowEnd = addZonedDays(today, windowDays, tz);

  const rules = await prisma.recurrenceRule.findMany({
    include: { tasks: { orderBy: { startTime: "asc" } } },
  });

  let created = 0;

  for (const rule of rules) {
    const template = rule.tasks[0];
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
