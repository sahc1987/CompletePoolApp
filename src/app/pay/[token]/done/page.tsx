import type { Metadata } from "next";
import Link from "next/link";
import { confirmReturn, getPublicInvoice } from "@/server/services/onlinePayments";
import { money } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment received",
  robots: { index: false, follow: false },
};

/**
 * Where Stripe sends the customer after checkout. The session is looked up
 * with Stripe, never taken from the URL on trust; if the webhook hasn't
 * recorded the payment yet, this records it (idempotently) so the customer
 * sees the right answer straight away.
 */
export default async function PayDonePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { session_id?: string };
}) {
  const outcome = await confirmReturn(params.token, searchParams.session_id ?? "");
  const invoice = outcome === "invalid" ? null : await getPublicInvoice(params.token);

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-lg">
        <img
          src="/logo-header.svg"
          alt="Complete Pool Service Inc."
          className="mx-auto mb-8 h-12 w-auto"
        />
        <div className="rounded-3xl border border-line/80 bg-white px-6 py-10 text-center shadow-card">
          {outcome === "paid" && invoice ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good/10 text-3xl text-good">
                ✓
              </div>
              <h1 className="text-2xl font-bold text-ink">Payment received</h1>
              <p className="mt-2 text-[15px] text-muted">
                Thank you, {invoice.clientName}. Your payment for invoice {invoice.invoiceNo} has
                been received.
              </p>
              <p className="mt-4 text-sm text-muted">
                {invoice.balance > 0
                  ? `Remaining balance: ${money(invoice.balance)}`
                  : "This invoice is paid in full."}
              </p>
            </>
          ) : outcome === "processing" ? (
            <>
              <h1 className="text-2xl font-bold text-ink">Payment processing</h1>
              <p className="mt-2 text-[15px] text-muted">
                We&apos;re confirming your payment with the card network. It will show on your
                invoice shortly — there&apos;s no need to pay again.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-ink">We couldn&apos;t confirm this payment</h1>
              <p className="mt-2 text-[15px] text-muted">
                If you completed checkout, your payment is safe and will appear on your
                invoice. Please don&apos;t pay again — contact our office if you have questions.
              </p>
            </>
          )}
          <Link
            href={`/pay/${params.token}`}
            className="mt-8 inline-block text-sm font-semibold text-navy-700 hover:underline"
          >
            Back to invoice
          </Link>
        </div>
      </div>
    </main>
  );
}
