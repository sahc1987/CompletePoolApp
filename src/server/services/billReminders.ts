import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/actor";
import { emailConfigured } from "@/server/email/mailer";
import { emailReminder } from "./billEmail";

/**
 * The daily overdue-invoice reminder run (cron: /api/cron/reminders).
 *
 * A bill with a balance gets up to three reminders, at 7, 14 and 30 days after
 * the invoice was created, and only when an admin has switched reminders on
 * (Settings -> Email), email is connected, and the client has an address. A
 * failed send is not counted, so it is tried again on the next run.
 *
 * "Due upon receipt" is the default term, so age is measured from the invoice,
 * not from a due date the app doesn't track. ponytail: change REMINDER_DAYS to
 * change the cadence; per-client terms would need a due-date column.
 */
export const REMINDER_DAYS = [7, 14, 30] as const;

/** At most this many emails per run, so one invocation stays well inside the function time limit. */
const BATCH = 40;

// A reminder is an operation of the system, not of a signed-in person. The
// actor only satisfies the services' own role check; the cron secret is what
// protects the entry point.
const SYSTEM: Actor = { id: "system-reminders", role: "ADMIN", name: "Reminders" };

const DAY_MS = 86_400_000;

export function reminderDue(
  bill: { createdAt: Date; remindersSent: number },
  now: Date
): boolean {
  const after = REMINDER_DAYS[bill.remindersSent];
  if (after === undefined) return false;
  return (now.getTime() - bill.createdAt.getTime()) / DAY_MS >= after;
}

export type ReminderRun = { enabled: boolean; sent: number; skipped: number };

export async function sendOverdueReminders(now: Date = new Date()): Promise<ReminderRun> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "app" },
    select: { remindersEnabled: true },
  });
  if (!settings?.remindersEnabled || !(await emailConfigured())) {
    return { enabled: false, sent: 0, skipped: 0 };
  }

  const candidates = await prisma.bill.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      remindersSent: { lt: REMINDER_DAYS.length },
      task: { client: { email: { not: null } } },
    },
    select: { id: true, createdAt: true, remindersSent: true },
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let skipped = 0;
  for (const bill of candidates) {
    if (!reminderDue(bill, now)) continue;
    if (sent >= BATCH) break;

    const res = await emailReminder(SYSTEM, bill.id);
    if (!res.ok) {
      skipped++;
      continue;
    }
    await prisma.bill.update({
      where: { id: bill.id },
      data: { remindersSent: { increment: 1 }, lastReminderAt: now },
    });
    sent++;
  }
  return { enabled: true, sent, skipped };
}
