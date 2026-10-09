"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { pdf } from "@react-pdf/renderer";
import {
  InvoiceDoc,
  LOGO_SRC_H,
  LOGO_SRC_W,
  NAVY_DEEP,
  ReceiptDoc,
  type InvoiceData,
  type ReceiptData,
} from "@/lib/pdf/billingDocs";

// The documents themselves live in lib/pdf so the API can render them on the
// server too (the mobile app downloads them); this file is the browser side.
export {
  InvoiceDoc,
  ReceiptDoc,
  type CompanyBlock,
  type InvoiceData,
  type ReceiptData,
} from "@/lib/pdf/billingDocs";

/**
 * The header logo as a PNG data URL, rendered once per page load.
 *
 * react-pdf's SVG support doesn't cover the logo's gradient-filled, skewed
 * lettering, so the browser draws the same /logo-header.svg the app shows onto
 * a canvas at 4× and the document embeds that — the PDF always matches the
 * live logo, with no second copy of the artwork to keep in sync. Resolves to
 * null if anything fails, and the document falls back to the name in type.
 */
let logoPromise: Promise<string | null> | null = null;

async function loadLogo(): Promise<string | null> {
  logoPromise ??= (async () => {
    try {
      const res = await fetch("/logo-header.svg");
      if (!res.ok) return null;
      // Crop the viewBox to the artwork, and give the SVG an intrinsic size —
      // some browsers won't rasterise one that only has a viewBox.
      const svg = (await res.text())
        .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${LOGO_SRC_W} ${LOGO_SRC_H}"`)
        .replace("<svg ", `<svg width="${LOGO_SRC_W}" height="${LOGO_SRC_H}" `);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        const img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("logo failed to load"));
          img.src = url;
        });
        const scale = 4;
        const canvas = document.createElement("canvas");
        canvas.width = LOGO_SRC_W * scale;
        canvas.height = LOGO_SRC_H * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return null;
    }
  })();
  const logo = await logoPromise;
  // Don't cache a failure — the next download gets another try.
  if (!logo) logoPromise = null;
  return logo;
}

function DownloadButton({
  label,
  filename,
  doc,
  qrFor,
  className,
}: {
  label: string;
  filename: string;
  /** Builds the document once its images are ready. */
  doc: (assets: { logo: string | null; qr: string | null }) => React.ReactElement;
  /** Draw a QR code for this URL and hand it to the document. */
  qrFor?: string | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const [logo, qr] = await Promise.all([
        loadLogo(),
        qrFor
          ? QRCode.toDataURL(qrFor, { margin: 1, width: 360, color: { dark: NAVY_DEEP } }).catch(
              () => null
            )
          : Promise.resolve(null),
      ]);
      const blob = await pdf(doc({ logo, qr })).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={
        className ??
        "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100 disabled:opacity-60"
      }
    >
      {busy ? "…" : label}
    </button>
  );
}

export function InvoiceButton({
  data,
  className,
}: {
  data: InvoiceData;
  className?: string;
}) {
  return (
    <DownloadButton
      label="Invoice"
      filename={`invoice-${data.invoiceNo}.pdf`}
      doc={({ logo, qr }) => <InvoiceDoc data={data} logo={logo} qr={qr} />}
      qrFor={data.status === "PAID" ? null : data.payUrl}
      className={className}
    />
  );
}

export function ReceiptButton({
  data,
  className,
}: {
  data: ReceiptData;
  className?: string;
}) {
  return (
    <DownloadButton
      label="Receipt"
      filename={`receipt-${data.receiptNo}.pdf`}
      doc={({ logo }) => <ReceiptDoc data={data} logo={logo} />}
      className={className}
    />
  );
}
