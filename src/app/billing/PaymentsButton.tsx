"use client";

import { ModalButton } from "@/components/Modal";
import { money } from "@/lib/serialize";
import { ReceiptButton, type ReceiptData } from "./BillingPdf";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  ONLINE: "Online",
};

export type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  checkNumber: string | null;
  billingAddress: string | null;
  note: string | null;
  paidAt: string | null;
  recordedBy: string | null;
  /** Position among *all* the bill's payments — stays 3 of 5 even when the
   *  list is trimmed to a date range. */
  seq?: number;
};

export type ReversalRow = {
  id: string;
  reason: string;
  amountReversed: number;
  paymentCount: number;
  createdAt: string;
  reversedBy: string | null;
};

// Full date + time, e.g. "Jul 18, 2026 · 3:42 PM" — the exact moment the money
// was recorded, not just the day.
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} · ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

// Read-only breakdown of every payment recorded against a bill. Lets an admin
// or owner see each partial payment, not just the running total.
export default function PaymentsButton({
  clientName,
  total,
  paid,
  balance,
  payments,
  receipts = [],
  reversals = [],
  rangeLabel,
}: {
  clientName: string;
  total: number;
  paid: number;
  balance: number;
  payments: PaymentRow[];
  /** Receipt payload per payment, in the same order. */
  receipts?: ReceiptData[];
  reversals?: ReversalRow[];
  /** Set when the page's date filter has trimmed these lists, so the modal
   *  doesn't read as the bill's whole history. */
  rangeLabel?: string;
}) {
  const count = payments.length;
  const label =
    count === 0
      ? "View history"
      : count > 1
        ? `View ${count} payments`
        : "View payment";

  return (
    <ModalButton
      label={label}
      title="Payment history"
      subtitle={clientName}
      icon={null}
      size="md"
      className="text-[12px] font-semibold text-navy-700 underline-offset-2 transition hover:underline"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <div className="text-xs text-muted">Total</div>
            <div className="mt-0.5 font-bold tabular-nums text-ink">{money(total)}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <div className="text-xs text-muted">Paid</div>
            <div className="mt-0.5 font-bold tabular-nums text-good">{money(paid)}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <div className="text-xs text-muted">Balance</div>
            <div
              className={`mt-0.5 font-bold tabular-nums ${
                balance > 0 ? "text-warn" : "text-faint"
              }`}
            >
              {balance > 0 ? money(balance) : "—"}
            </div>
          </div>
        </div>

        {rangeLabel && (
          <p className="-mt-2 text-[12px] text-muted">
            {rangeLabel} The totals above are the bill&rsquo;s full figures.
          </p>
        )}

        {payments.length > 0 ? (
          <ol className="space-y-2">
            {payments.map((p, i) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-line/80 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">
                    Payment {p.seq ?? i + 1}
                    <span className="ml-2 font-normal text-faint">
                      {METHOD_LABEL[p.method] ?? p.method}
                      {p.checkNumber ? ` #${p.checkNumber}` : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-faint">
                    {fmtDateTime(p.paidAt)}
                    {p.recordedBy && <> · by {p.recordedBy}</>}
                  </div>
                  {p.note && (
                    <div className="mt-1 text-[12px] italic text-muted">“{p.note}”</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="font-bold tabular-nums text-good">
                    {money(p.amount)}
                  </div>
                  {receipts[i] && (
                    <ReceiptButton
                      data={receipts[i]}
                      className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-navy-700 transition hover:bg-chrome-100 disabled:opacity-60"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">
            {rangeLabel
              ? "No payments on this bill in the selected range."
              : "No payments are currently recorded on this bill."}
          </p>
        )}

        {reversals.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">
              Reversal history
            </h3>
            <ol className="space-y-2">
              {reversals.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">{r.reason}</div>
                    <div className="mt-0.5 text-[12px] text-faint">
                      {fmtDateTime(r.createdAt)}
                      {r.reversedBy && <> · by {r.reversedBy}</>} ·{" "}
                      {r.paymentCount} payment
                      {r.paymentCount === 1 ? "" : "s"} removed
                    </div>
                  </div>
                  <div className="shrink-0 font-bold tabular-nums text-danger">
                    −{money(r.amountReversed)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </ModalButton>
  );
}
