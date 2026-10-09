import { invoiceNumber, receiptNumber } from "@/lib/billing";
import type { CompanyInfo } from "@/lib/company";
import type { BillPaymentRow, BillRow } from "@/server/services/billingReads";
import type { InvoiceData, ReceiptData } from "./billingDocs";

/**
 * A bill from the billing read model, dressed for its documents.
 *
 * Shared by the billing page (which builds the PDF in the browser) and the API
 * (which builds it on the server for the mobile app), so an invoice reads the
 * same whichever button made it.
 */

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  ONLINE: "Online",
};

/**
 * "Oct 8, 2026" in the business's zone. Without the zone this would format in
 * the server's (UTC on Vercel), and an evening payment would print as the
 * next day.
 */
export function docDate(iso: string | Date | null | undefined, timeZone?: string) {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function invoiceDataFor(
  b: BillRow,
  company: CompanyInfo,
  timeZone?: string
): InvoiceData {
  return {
    invoiceNo: invoiceNumber(b.invoiceNo),
    issuedAt: docDate(b.createdAt, timeZone),
    clientName: b.task.client.name,
    // The bill goes to the client's billing address; the pool is where the
    // work happened. They're often the same, and the document only prints the
    // service location separately when it actually differs.
    address: b.task.client.address ?? b.task.poolAddress,
    serviceAddress: b.task.poolAddress,
    clientPhone: b.task.client.phone,
    clientEmail: b.task.client.email,
    jobDate: docDate(b.task.date, timeZone),
    serviceName: b.task.serviceName,
    lineItems: b.lineItems,
    subtotal: b.subtotal,
    taxes: b.taxes,
    payUrl: b.payUrl,
    total: b.amount,
    paid: b.paid,
    balance: b.balance,
    status: b.status,
    company,
  };
}

export function receiptDataFor(
  b: BillRow,
  p: BillPaymentRow,
  company: CompanyInfo,
  timeZone?: string
): ReceiptData {
  return {
    receiptNo: receiptNumber(p.receiptNo),
    invoiceNo: invoiceNumber(b.invoiceNo),
    paidAt: docDate(p.paidAt, timeZone),
    clientName: b.task.client.name,
    address: b.task.client.address ?? b.task.poolAddress,
    serviceAddress: b.task.poolAddress,
    clientPhone: b.task.client.phone,
    clientEmail: b.task.client.email,
    serviceName: b.task.serviceName,
    jobDate: docDate(b.task.date, timeZone),
    amount: p.amount,
    method: METHOD_LABEL[p.method] ?? p.method,
    checkNumber: p.checkNumber,
    balanceAfter: p.balanceAfter,
    invoiceTotal: b.amount,
    recordedBy: p.recordedBy,
    note: p.note,
    company,
  };
}
