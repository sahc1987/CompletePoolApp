/**
 * @jest-environment node
 */
import { Prisma } from "@prisma/client";
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/notify", () => ({
  notifyAll: jest.fn(),
  notifyUser: jest.fn(),
  notifyRoles: jest.fn(),
}));
jest.mock("@/server/payments/stripe", () => ({
  stripeConfigured: () => false,
  payUrlFor: (t: string) => `https://app.test/pay/${t}`,
}));
jest.mock("@/lib/company", () => ({
  getCompanyInfo: jest.fn(async () => ({
    name: "Complete Pool Service Inc.",
    tagline: null,
    address: null,
    phone: null,
    email: null,
    website: null,
    taxId: null,
    paymentTerms: "Due upon receipt",
    paymentNote: null,
    documentFooter: null,
  })),
}));
jest.mock("@/lib/schedule", () => ({
  getBusinessTimezone: jest.fn(async () => "America/New_York"),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { listBillsPage } from "../billingReads";
import { renderInvoicePdf, renderReceiptPdf } from "../billDocuments";
import { docDate } from "@/lib/pdf/billDocData";

const dec = (n: number) => new Prisma.Decimal(n);
const admin = { id: "a1", role: "ADMIN" as const };
const owner = { id: "o1", role: "OWNER" as const };
const worker = { id: "w1", role: "WORKER" as const };

/** A bill in the shape billingReads' include returns. */
const bill = (id: string, clientId: string, amount: number, paid: number[]) => ({
  id,
  invoiceNo: 7,
  status: paid.length === 0 ? "PENDING" : paid.reduce((s, a) => s + a, 0) >= amount ? "PAID" : "PARTIAL",
  createdAt: new Date("2026-10-06T15:00:00Z"),
  amount: dec(amount),
  payToken: `tok-${id}`,
  payments: paid.map((a, i) => ({
    id: `${id}-p${i}`,
    receiptNo: 100 + i,
    amount: dec(a),
    method: "CASH",
    checkNumber: null,
    billingAddress: null,
    note: null,
    paidAt: new Date("2026-10-07T01:30:00Z"),
    recordedBy: { name: "Ana" },
  })),
  reversals: [],
  task: {
    id: `t-${id}`,
    date: new Date("2026-10-06T04:00:00Z"),
    client: { id: clientId, name: `Client ${clientId}`, address: "1 Main St", phone: null, email: null },
    service: { name: "Weekly clean" },
    pool: { address: "1 Main St" },
    extras: [],
    materials: [],
    estimate: null,
  },
});

beforeEach(() => {
  prismaMock.bill.findMany.mockReset();
  prismaMock.bill.findUnique.mockReset();
});

describe("listBillsPage", () => {
  beforeEach(() => {
    prismaMock.bill.findMany.mockResolvedValue([
      bill("b1", "c1", 100, []),
      bill("b2", "c1", 100, [40]),
      bill("b3", "c2", 50, [50]),
    ]);
  });

  it("counts every tab and totals the money", async () => {
    const res = await listBillsPage(admin);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.counts).toEqual({ all: 3, pending: 1, partial: 1, paid: 1, open: 2 });
    expect(res.data.totals).toEqual({ billed: 250, collected: 90, outstanding: 160 });
    expect(res.data.rows.map((r) => r.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("'open' is everything with a balance", async () => {
    const res = await listBillsPage(admin, { status: "open" });
    if (!res.ok) throw new Error(res.error);
    expect(res.data.rows.map((r) => r.id)).toEqual(["b1", "b2"]);
    expect(res.data.total).toBe(2);
  });

  it("scopes counts and totals to one client", async () => {
    const res = await listBillsPage(admin, { clientId: "c2" });
    if (!res.ok) throw new Error(res.error);
    expect(res.data.rows.map((r) => r.id)).toEqual(["b3"]);
    expect(res.data.totals).toEqual({ billed: 50, collected: 50, outstanding: 0 });
    expect(res.data.counts.open).toBe(0);
  });

  it("pages, clamping a page past the end", async () => {
    const res = await listBillsPage(admin, { perPage: 2, page: 9 });
    if (!res.ok) throw new Error(res.error);
    expect(res.data).toMatchObject({ page: 2, totalPages: 2, total: 3 });
    expect(res.data.rows.map((r) => r.id)).toEqual(["b3"]);
  });

  it("lets the owner read and keeps workers out", async () => {
    expect((await listBillsPage(owner)).ok).toBe(true);
    const res = await listBillsPage(worker);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("FORBIDDEN");
  });
});

describe("bill documents", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    // No logo server in a test: the document falls back to the name in type.
    global.fetch = jest.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it("renders the invoice as a PDF for the owner", async () => {
    prismaMock.bill.findUnique.mockResolvedValue(bill("b2", "c1", 100, [40]));
    const res = await renderInvoicePdf(owner, "b2", "https://app.test");
    if (!res.ok) throw new Error(res.error);
    expect(res.data.filename).toBe("invoice-INV-000007.pdf");
    expect(res.data.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("renders a receipt, and 404s a payment that isn't on the bill", async () => {
    prismaMock.bill.findUnique.mockResolvedValue(bill("b2", "c1", 100, [40]));
    const res = await renderReceiptPdf(admin, "b2", "b2-p0", "https://app.test");
    if (!res.ok) throw new Error(res.error);
    expect(res.data.filename).toBe("receipt-RCP-000100.pdf");

    const missing = await renderReceiptPdf(admin, "b2", "nope", "https://app.test");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("NOT_FOUND");
  }, 30_000);

  it("keeps workers out", async () => {
    const res = await renderInvoicePdf(worker, "b2", "https://app.test");
    expect(res.ok).toBe(false);
    expect(prismaMock.bill.findUnique).not.toHaveBeenCalled();
  });

  it("dates documents in the business's zone, not the server's", () => {
    // 01:30 UTC on the 7th is still the evening of the 6th in New York.
    expect(docDate("2026-10-07T01:30:00Z", "America/New_York")).toBe("Oct 6, 2026");
  });
});
