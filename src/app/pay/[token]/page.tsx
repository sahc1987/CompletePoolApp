import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicInvoice } from "@/server/services/onlinePayments";
import { money } from "@/lib/serialize";
import PayButton from "./PayButton";

export const dynamic = "force-dynamic";

// A pay link is private to one customer; keep it out of search engines.
export const metadata: Metadata = {
  title: "Pay your invoice",
  robots: { index: false, follow: false },
};

/**
 * The customer-facing pay page, reached from the link or QR code on their
 * invoice. Public — the token in the URL is the credential. Shows the invoice
 * and sends them to Stripe's hosted checkout for the full balance.
 */
export default async function PayPage({ params }: { params: { token: string } }) {
  const invoice = await getPublicInvoice(params.token);
  if (!invoice) notFound();

  const settled = invoice.balance <= 0;
  const contact = [invoice.companyPhone, invoice.companyEmail].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-lg">
        <img
          src="/logo-header.svg"
          alt={invoice.companyName}
          className="mx-auto mb-8 h-12 w-auto"
        />

        <div className="overflow-hidden rounded-3xl border border-line/80 bg-white shadow-card">
          <div className="bg-navy-700 px-6 py-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Invoice {invoice.invoiceNo}
            </div>
            <div className="mt-1 text-lg font-semibold">{invoice.clientName}</div>
            <div className="text-sm text-white/80">
              {invoice.serviceName} · {invoice.jobDate}
            </div>
          </div>

          <div className="px-6 py-5">
            <ul className="divide-y divide-line text-[15px]">
              {invoice.lineItems.map((li, i) => (
                <li key={`${li.description}-${i}`} className="flex justify-between gap-4 py-2.5">
                  <span>
                    <span className="font-medium text-ink">{li.description}</span>
                    {li.detail && <span className="block text-xs text-muted">{li.detail}</span>}
                  </span>
                  <span className="tabular-nums text-ink">{money(li.amount)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[15px]">
              {invoice.taxes.length > 0 && (
                <>
                  <div className="flex justify-between text-muted">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
                  </div>
                  {invoice.taxes.map((t) => (
                    <div key={t.name} className="flex justify-between text-muted">
                      <dt>
                        {t.name} ({t.ratePercent}%)
                      </dt>
                      <dd className="tabular-nums">{money(t.amount)}</dd>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between font-semibold text-ink">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(invoice.total)}</dd>
              </div>
              {invoice.paid > 0 && (
                <div className="flex justify-between text-good">
                  <dt>Paid</dt>
                  <dd className="tabular-nums">− {money(invoice.paid)}</dd>
                </div>
              )}
            </dl>

            <div
              className={`mt-5 flex items-center justify-between rounded-2xl px-5 py-4 ${
                settled ? "bg-good/10 text-good" : "bg-chrome-100 text-navy-900"
              }`}
            >
              <span className="text-sm font-bold uppercase tracking-wider">
                {settled ? "Paid in full" : "Amount due"}
              </span>
              <span className="text-2xl font-bold tabular-nums">
                {money(settled ? invoice.total : invoice.balance)}
              </span>
            </div>

            <div className="mt-6">
              {settled ? (
                <p className="text-center text-[15px] text-muted">
                  Nothing is owed on this invoice. Thank you!
                </p>
              ) : invoice.canPayOnline ? (
                <>
                  <PayButton
                    token={params.token}
                    label={`Pay ${money(invoice.balance)} by card`}
                  />
                  <p className="mt-3 text-center text-xs text-faint">
                    Secure checkout by Stripe. Card, Apple Pay and Google Pay accepted.
                  </p>
                </>
              ) : (
                <p className="text-center text-[15px] text-muted">
                  Online payment isn&apos;t available right now. Please contact us to pay.
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          {invoice.companyName}
          {contact && <span className="block">{contact}</span>}
        </p>
      </div>
    </main>
  );
}
