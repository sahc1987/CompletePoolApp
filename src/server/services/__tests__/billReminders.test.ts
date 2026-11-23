/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/server/email/mailer", () => ({ emailConfigured: jest.fn() }));
jest.mock("../billEmail", () => ({ emailReminder: jest.fn() }));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { emailConfigured } = jest.requireMock("@/server/email/mailer");
const { emailReminder } = jest.requireMock("../billEmail");

import { reminderDue, sendOverdueReminders } from "../billReminders";

const NOW = new Date("2026-11-22T14:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.appSettings.findUnique.mockResolvedValue({ remindersEnabled: true });
  emailConfigured.mockResolvedValue(true);
  emailReminder.mockResolvedValue({ ok: true, data: { sentTo: "x@example.com" } });
});

describe("when a reminder is due", () => {
  it("follows 7, 14 and 30 days, then stops", () => {
    expect(reminderDue({ createdAt: daysAgo(6.9), remindersSent: 0 }, NOW)).toBe(false);
    expect(reminderDue({ createdAt: daysAgo(7), remindersSent: 0 }, NOW)).toBe(true);
    // The second waits for day 14 even though day 7 has long passed.
    expect(reminderDue({ createdAt: daysAgo(13), remindersSent: 1 }, NOW)).toBe(false);
    expect(reminderDue({ createdAt: daysAgo(14), remindersSent: 1 }, NOW)).toBe(true);
    expect(reminderDue({ createdAt: daysAgo(30), remindersSent: 2 }, NOW)).toBe(true);
    expect(reminderDue({ createdAt: daysAgo(400), remindersSent: 3 }, NOW)).toBe(false);
  });
});

describe("the daily run", () => {
  it("does nothing while reminders are switched off", async () => {
    prismaMock.appSettings.findUnique.mockResolvedValue({ remindersEnabled: false });
    expect(await sendOverdueReminders(NOW)).toEqual({ enabled: false, sent: 0, skipped: 0 });
    expect(prismaMock.bill.findMany).not.toHaveBeenCalled();
    expect(emailReminder).not.toHaveBeenCalled();
  });

  it("does nothing when email isn't set up", async () => {
    emailConfigured.mockResolvedValue(false);
    expect((await sendOverdueReminders(NOW)).enabled).toBe(false);
    expect(emailReminder).not.toHaveBeenCalled();
  });

  it("sends only the due ones and counts them", async () => {
    prismaMock.bill.findMany.mockResolvedValue([
      { id: "due", createdAt: daysAgo(8), remindersSent: 0 },
      { id: "too-new", createdAt: daysAgo(3), remindersSent: 0 },
      { id: "second-not-yet", createdAt: daysAgo(10), remindersSent: 1 },
    ]);
    expect(await sendOverdueReminders(NOW)).toEqual({ enabled: true, sent: 1, skipped: 0 });
    expect(emailReminder).toHaveBeenCalledTimes(1);
    expect(emailReminder.mock.calls[0][1]).toBe("due");
    expect(prismaMock.bill.update).toHaveBeenCalledWith({
      where: { id: "due" },
      data: { remindersSent: { increment: 1 }, lastReminderAt: NOW },
    });
  });

  it("doesn't count a failed send, so it is tried again tomorrow", async () => {
    prismaMock.bill.findMany.mockResolvedValue([{ id: "b1", createdAt: daysAgo(9), remindersSent: 0 }]);
    emailReminder.mockResolvedValue({ ok: false, code: "STATE", error: "The email couldn't be sent." });
    expect(await sendOverdueReminders(NOW)).toEqual({ enabled: true, sent: 0, skipped: 1 });
    expect(prismaMock.bill.update).not.toHaveBeenCalled();
  });
});
