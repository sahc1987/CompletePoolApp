-- Overdue-invoice reminders. The switch defaults to off and the counters to 0,
-- so applying this changes nothing a customer sees until an admin turns
-- reminders on under Settings -> Email.
ALTER TABLE "AppSettings" ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Bill" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;
