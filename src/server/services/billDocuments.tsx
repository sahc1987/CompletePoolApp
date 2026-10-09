import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCompanyInfo } from "@/lib/company";
import { getBusinessTimezone } from "@/lib/schedule";
import { invoiceDataFor, receiptDataFor } from "@/lib/pdf/billDocData";
import { InvoiceDoc, NAVY_DEEP, ReceiptDoc } from "@/lib/pdf/billingDocs";
import type { Actor } from "@/server/actor";
import { notFound, ok, type ServiceResult } from "@/server/result";
import { getBill } from "./billingReads";

/**
 * Invoices and receipts rendered on the server, for the mobile app.
 *
 * The web builds the same documents in the browser (billing/BillingPdf.tsx);
 * a phone has no react-pdf, so it asks for the finished file instead. Both
 * draw the one design in lib/pdf/billingDocs.tsx from the one data mapping in
 * lib/pdf/billDocData.ts. Access is getBill's: admin and owner — a document is
 * a read, so the owner gets it too.
 */

export type PdfFile = { filename: string; bytes: Buffer };

/**
 * The header logo, pre-rasterised (public/logo-header.png — the browser draws
 * the SVG on a canvas, which a server can't). Fetched from the app's own
 * origin because Vercel doesn't ship /public inside the function. A failure
 * prints the company name in type instead, and isn't cached.
 */
let logoCache: string | null = null;

async function loadLogo(origin: string): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch(new URL("/logo-header.png", origin));
    if (!res.ok) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    logoCache = `data:image/png;base64,${b64}`;
    return logoCache;
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(
  actor: Actor,
  billId: string,
  origin: string
): Promise<ServiceResult<PdfFile>> {
  const res = await getBill(actor, billId);
  if (!res.ok) return res;
  if (!res.data) return notFound("Bill not found.");
  const bill = res.data;

  const [company, tz, logo] = await Promise.all([
    getCompanyInfo(),
    getBusinessTimezone(),
    loadLogo(origin),
  ]);
  const data = invoiceDataFor(bill, company, tz);
  const qr =
    data.status !== "PAID" && data.payUrl
      ? await QRCode.toDataURL(data.payUrl, {
          margin: 1,
          width: 360,
          color: { dark: NAVY_DEEP },
        }).catch(() => null)
      : null;

  const bytes = await renderToBuffer(<InvoiceDoc data={data} logo={logo} qr={qr} />);
  return ok({ filename: `invoice-${data.invoiceNo}.pdf`, bytes });
}

export async function renderReceiptPdf(
  actor: Actor,
  billId: string,
  paymentId: string,
  origin: string
): Promise<ServiceResult<PdfFile>> {
  const res = await getBill(actor, billId);
  if (!res.ok) return res;
  const payment = res.data?.payments.find((p) => p.id === paymentId);
  if (!res.data || !payment) return notFound("Receipt not found.");

  const [company, tz, logo] = await Promise.all([
    getCompanyInfo(),
    getBusinessTimezone(),
    loadLogo(origin),
  ]);
  const data = receiptDataFor(res.data, payment, company, tz);
  const bytes = await renderToBuffer(<ReceiptDoc data={data} logo={logo} />);
  return ok({ filename: `receipt-${data.receiptNo}.pdf`, bytes });
}
