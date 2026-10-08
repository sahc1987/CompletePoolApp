"use client";

import { useState } from "react";

/**
 * The two ways staff hand a customer their online pay link: copy it to send by
 * text or email, or open it right now on this device so the customer can pay
 * on the spot. Renders nothing when the bill has no link (paid, or online
 * payment isn't set up).
 */
export default function PayLinkActions({
  payUrl,
  compact,
}: {
  payUrl: string | null;
  /** Table rows: smaller text buttons. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!payUrl) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(payUrl!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (non-HTTPS, permissions): let them copy it by hand.
      window.prompt("Copy the pay link:", payUrl!);
    }
  }

  const cls = compact
    ? "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100"
    : "inline-flex items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-navy-500/40 hover:bg-chrome-100";

  return (
    <>
      <button type="button" onClick={copy} className={cls}>
        {copied ? "Link copied" : "Copy pay link"}
      </button>
      <a href={payUrl} target="_blank" rel="noopener noreferrer" className={cls}>
        Take card now
      </a>
    </>
  );
}
