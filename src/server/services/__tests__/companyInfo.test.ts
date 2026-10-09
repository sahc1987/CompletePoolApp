/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/notify", () => ({ notifyAll: jest.fn(), notifyUser: jest.fn() }));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { saveCompanyInfo } from "../settings";

const admin = { id: "a1", role: "ADMIN" as const };

beforeEach(() => {
  prismaMock.appSettings.upsert.mockReset();
  prismaMock.appSettings.upsert.mockResolvedValue({} as never);
});

describe("saveCompanyInfo", () => {
  it("stores blanks as empty, and blank terms as the default", async () => {
    const res = await saveCompanyInfo(admin, {
      name: "  Complete Pool Service Inc. ",
      phone: "555-0100",
      email: "",
      paymentTerms: "  ",
    });
    expect(res.ok).toBe(true);
    const call = prismaMock.appSettings.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(call.update).toMatchObject({
      companyName: "Complete Pool Service Inc.",
      companyPhone: "555-0100",
      companyEmail: null,
      companyAddress: null,
      paymentTerms: "Due upon receipt",
    });
    // Before the settings row exists, the same values create it.
    expect(call.create).toMatchObject({ id: "app", companyName: "Complete Pool Service Inc." });
  });

  it("requires a name and a real email", async () => {
    const noName = await saveCompanyInfo(admin, { name: " " });
    expect(noName).toMatchObject({ ok: false, code: "VALIDATION" });
    const badEmail = await saveCompanyInfo(admin, { name: "X", email: "not-an-email" });
    expect(badEmail).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });

  it("is admin-only — the owner reads billing but doesn't edit the paperwork", async () => {
    const res = await saveCompanyInfo({ id: "o1", role: "OWNER" }, { name: "X" });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
