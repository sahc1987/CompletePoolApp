/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/notify", () => ({ notifyAll: jest.fn(), notifyUser: jest.fn(), notifyRoles: jest.fn() }));
jest.mock("@/server/email/mailer", () => ({ verifyLogin: jest.fn(), emailConfigured: jest.fn() }));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { verifyLogin, emailConfigured } = jest.requireMock("@/server/email/mailer");

import { open, seal } from "@/server/crypto/secretBox";
import { saveEmailSettings, setRemindersEnabled } from "../settings";

const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Olive" };
const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };

const input = { user: "Billing@Example.com", password: "abcd efgh ijkl mnop", fromName: "Complete Pool" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret-one";
  verifyLogin.mockResolvedValue(undefined);
});

describe("storing the app password", () => {
  it("round-trips, and the stored text is not the password", () => {
    const sealed = seal("abcdefghijklmnop");
    expect(sealed).not.toContain("abcdefghijklmnop");
    expect(open(sealed)).toBe("abcdefghijklmnop");
  });

  it("can't be read under a different secret, or once tampered with", () => {
    const sealed = seal("abcdefghijklmnop");
    process.env.NEXTAUTH_SECRET = "a-different-secret";
    expect(open(sealed)).toBeNull();
    process.env.NEXTAUTH_SECRET = "test-secret-one";
    expect(open(sealed.slice(0, -2) + "xx")).toBeNull();
    expect(open("not-a-sealed-value")).toBeNull();
  });
});

describe("who may set up email", () => {
  it.each([["a worker", worker], ["the read-only owner", owner]])("refuses %s", async (_n, actor) => {
    const res = await saveEmailSettings(actor, input);
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(verifyLogin).not.toHaveBeenCalled();
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("saving only when the login works", () => {
  it("tests the login, then saves it encrypted", async () => {
    const res = await saveEmailSettings(admin, input);
    expect(res).toEqual({ ok: true, data: { user: "billing@example.com" } });
    // Lower-cased, and the spaces Google shows in the password are dropped.
    expect(verifyLogin).toHaveBeenCalledWith("billing@example.com", "abcdefghijklmnop");

    const saved = prismaMock.appSettings.upsert.mock.calls[0][0].update;
    expect(saved.smtpUser).toBe("billing@example.com");
    expect(saved.smtpFrom).toBe("Complete Pool");
    expect(JSON.stringify(saved)).not.toContain("abcdefghijklmnop");
    expect(open(saved.smtpPassEnc)).toBe("abcdefghijklmnop");
  });

  it("saves nothing, and leaks nothing, when Google refuses the login", async () => {
    verifyLogin.mockRejectedValue(new Error("535 5.7.8 Username and Password not accepted for billing@example.com"));
    const res = await saveEmailSettings(admin, input);
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(res)).not.toContain("535");
    expect(JSON.stringify(res)).not.toContain("billing@example.com");
    expect(JSON.stringify(res)).toContain("nothing was saved");
  });

  it("rejects a bad address before contacting Google", async () => {
    const res = await saveEmailSettings(admin, { ...input, user: "not-an-email" });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(verifyLogin).not.toHaveBeenCalled();
  });

  it("rejects a sender name with a line break (header injection)", async () => {
    const res = await saveEmailSettings(admin, { ...input, fromName: "Pool\r\nBcc: x@evil.com" });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(verifyLogin).not.toHaveBeenCalled();
  });
});

describe("turning overdue reminders on", () => {
  it.each([["a worker", worker], ["the read-only owner", owner]])("refuses %s", async (_n, actor) => {
    const res = await setRemindersEnabled(actor, { enabled: true });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });

  it("won't switch on until email works", async () => {
    emailConfigured.mockResolvedValue(false);
    const res = await setRemindersEnabled(admin, { enabled: true });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });

  it("switches on once email works, and off any time", async () => {
    emailConfigured.mockResolvedValue(true);
    expect(await setRemindersEnabled(admin, { enabled: true })).toEqual({ ok: true, data: { enabled: true } });
    emailConfigured.mockResolvedValue(false);
    expect(await setRemindersEnabled(admin, { enabled: false })).toEqual({ ok: true, data: { enabled: false } });
  });
});
