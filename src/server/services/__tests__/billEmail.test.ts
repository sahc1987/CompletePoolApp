/**
 * @jest-environment node
 */
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/notify", () => ({ notifyAll: jest.fn(), notifyUser: jest.fn(), notifyRoles: jest.fn() }));
jest.mock("../billingReads", () => ({ getBill: jest.fn() }));
jest.mock("../billDocuments", () => ({ renderInvoicePdf: jest.fn() }));
jest.mock("@/server/email/mailer", () => ({ emailConfigured: jest.fn(), sendMail: jest.fn() }));
jest.mock("@/lib/company", () => ({
  getCompanyInfo: jest.fn().mockResolvedValue({ name: "Complete Pool", phone: null, paymentNote: null }),
}));

const { getBill } = jest.requireMock("../billingReads");
const { renderInvoicePdf } = jest.requireMock("../billDocuments");
const { emailConfigured, sendMail } = jest.requireMock("@/server/email/mailer");

import { emailInvoice } from "../billEmail";

const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Olive" };
const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };

const bill = (email: string | null, balance = 45) => ({
  ok: true,
  data: { balance, payUrl: "https://app.test/pay/abc", task: { client: { name: "Casa Verde", email } } },
});

beforeEach(() => {
  jest.clearAllMocks();
  getBill.mockResolvedValue(bill("casa@example.com"));
  emailConfigured.mockResolvedValue(true);
  renderInvoicePdf.mockResolvedValue({ ok: true, data: { filename: "invoice-1.pdf", bytes: Buffer.from("pdf") } });
  sendMail.mockResolvedValue(undefined);
});

describe("who may email an invoice", () => {
  it.each([["a worker", worker], ["the read-only owner", owner]])("refuses %s", async (_n, actor) => {
    const res = await emailInvoice(actor, "b1");
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("emailing an invoice", () => {
  it("sends the PDF and pay link to the client", async () => {
    const res = await emailInvoice(admin, "b1");
    expect(res).toEqual({ ok: true, data: { sentTo: "casa@example.com" } });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("casa@example.com");
    expect(mail.text).toContain("https://app.test/pay/abc");
    expect(mail.attachments[0].filename).toBe("invoice-1.pdf");
  });

  it("leaves the pay link out once nothing is owing", async () => {
    getBill.mockResolvedValue(bill("casa@example.com", 0));
    await emailInvoice(admin, "b1");
    expect(sendMail.mock.calls[0][0].text).not.toContain("/pay/");
  });

  it("asks for an email address when the client has none", async () => {
    getBill.mockResolvedValue(bill(null));
    const res = await emailInvoice(admin, "b1");
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("says so when email isn't set up", async () => {
    emailConfigured.mockResolvedValue(false);
    const res = await emailInvoice(admin, "b1");
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("never shows the mail server's own error", async () => {
    sendMail.mockRejectedValue(new Error("535 bad password for casa-secret@gmail.com"));
    const res = await emailInvoice(admin, "b1");
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(JSON.stringify(res)).not.toContain("535");
    expect(JSON.stringify(res)).not.toContain("secret");
  });
});
