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

const stripeMock = {
  checkout: {
    sessions: {
      create: jest.fn(),
      retrieve: jest.fn(),
      expire: jest.fn(),
    },
  },
  webhooks: { constructEvent: jest.fn() },
};
const configured = jest.fn(() => true);
jest.mock("@/server/payments/stripe", () => ({
  stripeConfigured: () => configured(),
  getStripe: () => stripeMock,
  appBaseUrl: () => "https://app.test",
  webhookSecret: () => "whsec_test",
  payUrlFor: (t: string) => `https://app.test/pay/${t}`,
  toCents: (d: number) => Math.round(d * 100),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { notifyRoles } = jest.requireMock("@/lib/notify");

import {
  confirmReturn,
  getPublicInvoice,
  handleStripeWebhook,
  recordCheckoutSession,
  startCheckout,
} from "../onlinePayments";
import { payBill } from "../billing";
import { recordPayment } from "@/lib/billing";

const TOKEN = "0123456789abcdef0123456789abcdef";
const dec = (n: number) => new Prisma.Decimal(n);

/** A $150 bill with the given payments, and whatever checkout it remembers. */
const seedBill = (paid: number[] = [], checkoutSessionId: string | null = null) => {
  prismaMock.bill.findUnique.mockResolvedValue({
    id: "b1",
    invoiceNo: 42,
    amount: dec(150),
    paidAt: null,
    payToken: TOKEN,
    checkoutSessionId,
    payments: paid.map((a, i) => ({ id: `p${i}`, amount: dec(a) })),
    task: {
      date: new Date("2026-10-06T04:00:00Z"),
      client: { name: "Casa Verde" },
      service: { name: "Weekly clean" },
      extras: [],
      materials: [],
      estimate: null,
    },
  });
};

const paidSession = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_1",
  status: "complete",
  payment_status: "paid",
  client_reference_id: "b1",
  payment_intent: "pi_1",
  amount_total: 15000,
  customer_details: {
    address: { line1: "1 Palm Way", city: "Wantagh", state: "NY", postal_code: "11793", country: "US" },
  },
  ...over,
});

beforeEach(() => {
  configured.mockReturnValue(true);
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  seedBill();
  prismaMock.payment.findUnique.mockReset().mockResolvedValue(null);
  stripeMock.checkout.sessions.create.mockResolvedValue({
    id: "cs_new",
    status: "open",
    url: "https://checkout.stripe.test/new",
  });
});

describe("the pay link", () => {
  it("rejects a malformed token without touching the database", async () => {
    expect(await getPublicInvoice("../../etc")).toBeNull();
    expect(prismaMock.bill.findUnique).not.toHaveBeenCalled();
  });

  it("shows the outstanding balance", async () => {
    seedBill([50]);
    const inv = await getPublicInvoice(TOKEN);
    expect(inv).toMatchObject({ invoiceNo: "INV-000042", total: 150, paid: 50, balance: 100 });
  });
});

describe("starting a checkout", () => {
  it("charges the full balance, cards and wallets only", async () => {
    seedBill([50]);
    const res = await startCheckout(TOKEN);
    expect(res).toEqual({ ok: true, data: { url: "https://checkout.stripe.test/new" } });

    const [params, opts] = stripeMock.checkout.sessions.create.mock.calls[0];
    expect(params.allowed_payment_method_types).toEqual(["card"]);
    expect(params.line_items[0].price_data.unit_amount).toBe(10000);
    expect(params.client_reference_id).toBe("b1");
    expect(opts.idempotencyKey).toBe("checkout:b1:10000:1:first");
    // Remembered, so the next tap reuses it.
    expect(prismaMock.bill.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { checkoutSessionId: "cs_new" },
    });
  });

  it("won't open a checkout for a paid bill", async () => {
    seedBill([150]);
    const res = await startCheckout(TOKEN);
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("is unavailable until Stripe is configured", async () => {
    configured.mockReturnValue(false);
    const res = await startCheckout(TOKEN);
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });
});

describe("no double payment", () => {
  it("sends a second tap to the same open checkout", async () => {
    seedBill([], "cs_open");
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_open",
      status: "open",
      amount_total: 15000,
      url: "https://checkout.stripe.test/open",
    });
    const res = await startCheckout(TOKEN);
    expect(res).toEqual({ ok: true, data: { url: "https://checkout.stripe.test/open" } });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("closes a checkout for an out-of-date balance before opening a new one", async () => {
    seedBill([50], "cs_stale");
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_stale",
      status: "open",
      amount_total: 15000, // opened before the $50 was recorded
      url: "https://checkout.stripe.test/stale",
    });
    await startCheckout(TOKEN);
    expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith("cs_stale");
    expect(stripeMock.checkout.sessions.create.mock.calls[0][1].idempotencyKey).toBe(
      "checkout:b1:10000:1:cs_stale"
    );
  });

  it("refuses to open another checkout when the last one was already paid", async () => {
    seedBill([], "cs_done");
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(paidSession({ id: "cs_done" }));
    const res = await startCheckout(TOKEN);
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    // ...and the payment the webhook hadn't delivered yet is recorded now.
    expect(prismaMock.payment.create).toHaveBeenCalled();
  });

  it("records a Stripe payment once, however many times it's reported", async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: "p-existing" });
    expect(await recordCheckoutSession(paidSession() as never)).toBe("duplicate");
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(notifyRoles).not.toHaveBeenCalled();
  });

  it("treats two simultaneous reports as one (unique index)", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" })
    );
    const res = await recordPayment({
      billId: "b1",
      amount: 150,
      method: "ONLINE",
      billingAddress: "x",
      stripePaymentIntentId: "pi_1",
    });
    expect(res).toEqual({ duplicate: true });
  });

  it("closes the customer's open checkout when the office records a payment", async () => {
    seedBill([], "cs_open");
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_open", status: "open" });
    await payBill({ id: "a1", role: "ADMIN" }, { billId: "b1", amount: 150, method: "CASH" });
    expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith("cs_open");
  });

  it("still records money Stripe took if it overpays, and flags it for a refund", async () => {
    seedBill([150]);
    expect(await recordCheckoutSession(paidSession() as never)).toBe("recorded");
    expect(prismaMock.payment.create.mock.calls[0][0].data).toMatchObject({
      amount: 150,
      method: "ONLINE",
      stripePaymentIntentId: "pi_1",
      billingAddress: "1 Palm Way, Wantagh, NY 11793, US",
    });
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN"],
      expect.stringContaining("overpaid by $150.00"),
      { link: "/billing" }
    );
  });
});

describe("recording from Stripe", () => {
  it("ignores a checkout that isn't paid", async () => {
    expect(await recordCheckoutSession(paidSession({ payment_status: "unpaid" }) as never)).toBe(
      "not_paid"
    );
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it("won't mark a bill paid with someone else's checkout", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ client_reference_id: "other-bill" })
    );
    expect(await confirmReturn(TOKEN, "cs_test_1")).toBe("invalid");
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it("confirms the customer's return from checkout", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(paidSession());
    expect(await confirmReturn(TOKEN, "cs_test_1")).toBe("paid");
  });

  it("rejects a webhook with a bad signature", async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    expect(await handleStripeWebhook("{}", "t=1,v1=x")).toBe(400);
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it("records a payment from a verified webhook", async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: paidSession() },
    });
    expect(await handleStripeWebhook("{}", "t=1,v1=ok")).toBe(200);
    expect(prismaMock.payment.create).toHaveBeenCalled();
  });
});
