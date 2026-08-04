"use client";

import { useState } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";

// react-pdf hyphenates on overflow by default, which breaks emails and URLs
// mid-word ("m.whitfield@exam-ple.com"). Contact details have to stay
// transcribable, so words wrap whole or not at all.
Font.registerHyphenationCallback((word) => [word]);

// Invoice (issued when a job is approved and billed) and receipt (issued per
// payment) share a masthead, party block, table and footer, so the chrome lives
// in one place and each document only describes its own middle.

export type CompanyBlock = {
  name: string;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  paymentNote?: string | null;
  documentFooter?: string | null;
};

type PartyBlock = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type InvoiceData = {
  invoiceNo: string;
  issuedAt: string;
  clientName: string;
  /** Billing address — where the bill goes. */
  address?: string | null;
  /** Where the work happened; shown only when it differs from the above. */
  serviceAddress?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  jobDate: string;
  serviceName: string;
  lineItems: { description: string; amount: number }[];
  total: number;
  paid: number;
  balance: number;
  status: "PENDING" | "PARTIAL" | "PAID";
  company?: CompanyBlock;
};

export type ReceiptData = {
  receiptNo: string;
  invoiceNo: string;
  paidAt: string;
  clientName: string;
  address?: string | null;
  serviceAddress?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  serviceName: string;
  jobDate: string;
  amount: number;
  method: string;
  checkNumber?: string | null;
  /** What was still owed after this payment landed. */
  balanceAfter: number;
  invoiceTotal: number;
  recordedBy?: string | null;
  note?: string | null;
  company?: CompanyBlock;
};

const DEFAULT_COMPANY: CompanyBlock = {
  name: "Complete Pool Service Inc.",
  tagline: "Pool maintenance & repair",
  paymentTerms: "Due upon receipt",
};

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid in full",
};

// Brand navy, matching the app chrome. Ink is near-black rather than pure
// black — pure black on white prints harshly.
const NAVY = "#1c3f7a";
const INK = "#182233";
const MUTED = "#6b7280";
const RULE = "#dbe3ee";
const GOOD = "#166534";
const DANGER = "#b3261e";
// A part-paid bill isn't a problem, so it reads amber rather than red.
const WARN = "#a16207";

const STATUS_COLOR: Record<string, string> = {
  PENDING: DANGER,
  PARTIAL: WARN,
  PAID: GOOD,
};

const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 46,
    paddingBottom: 78,
    fontSize: 9.5,
    lineHeight: 1.45,
    color: INK,
    fontFamily: "Helvetica",
  },

  // --- masthead ---
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.2 },
  brandTag: { fontSize: 8.5, color: MUTED, marginTop: 1.5 },
  brandLine: { fontSize: 8.5, color: MUTED },
  brandContact: { marginTop: 6 },

  docTitle: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    letterSpacing: 3,
    textAlign: "right",
  },
  // Reference block: label/value pairs right-aligned under the title.
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  metaLabel: { fontSize: 8.5, color: MUTED, marginRight: 8 },
  metaValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
    width: 96,
    textAlign: "right",
  },

  // The document's strongest horizontal, closing the masthead.
  hr: { height: 2.5, backgroundColor: NAVY, marginTop: 14 },

  // --- party blocks ---
  parties: { flexDirection: "row", marginTop: 18 },
  party: { flex: 1, paddingRight: 18 },
  label: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  partyName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 2 },
  soft: { color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },

  // --- table ---
  thead: {
    flexDirection: "row",
    backgroundColor: "#f2f6fc",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: RULE,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 22,
  },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 1 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: RULE,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  cDesc: { flex: 1 },
  cAmt: { width: 84, textAlign: "right" },
  itemName: { fontFamily: "Helvetica-Bold" },
  itemSub: { fontSize: 8, color: MUTED, marginTop: 1 },

  // --- totals ---
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 236 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: NAVY,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  grandLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 0.8 },
  grandValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff" },

  // Status chip, in place of the old outlined "stamp".
  chip: {
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    color: "#ffffff",
  },
  chipRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 9 },

  // --- notes / terms ---
  panel: {
    marginTop: 20,
    borderLeftWidth: 2.5,
    borderColor: NAVY,
    paddingLeft: 10,
    paddingVertical: 2,
  },

  // --- footer ---
  footer: {
    position: "absolute",
    bottom: 34,
    left: 46,
    right: 46,
    borderTopWidth: 1,
    borderColor: RULE,
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footText: { fontSize: 7.5, color: MUTED },
});

/** Joins parts of a contact line, dropping anything blank. */
const join = (parts: (string | null | undefined)[], sep = "  ·  ") =>
  parts.filter((p) => p && String(p).trim()).join(sep);

/**
 * Company names routinely end in "Inc." or "Co.", which collides with the
 * period closing a sentence they're dropped into ("...Complete Pool Service
 * Inc..").
 */
const midSentence = (name: string) => name.replace(/\.\s*$/, "");

function Masthead({
  company,
  docTitle,
  meta,
}: {
  company: CompanyBlock;
  docTitle: string;
  meta: { label: string; value: string }[];
}) {
  const contact = join([company.phone, company.email]);
  return (
    <>
      <View style={s.masthead}>
        <View style={{ flex: 1, paddingRight: 24 }}>
          <Text style={s.brandName}>{company.name}</Text>
          {company.tagline ? <Text style={s.brandTag}>{company.tagline}</Text> : null}
          <View style={s.brandContact}>
            {company.address ? <Text style={s.brandLine}>{company.address}</Text> : null}
            {contact ? <Text style={s.brandLine}>{contact}</Text> : null}
            {company.website ? <Text style={s.brandLine}>{company.website}</Text> : null}
            {company.taxId ? <Text style={s.brandLine}>Tax ID {company.taxId}</Text> : null}
          </View>
        </View>

        <View>
          <Text style={s.docTitle}>{docTitle}</Text>
          <View style={{ marginTop: 8 }}>
            {meta.map((m) => (
              <View style={s.metaRow} key={m.label}>
                <Text style={s.metaLabel}>{m.label}</Text>
                <Text style={s.metaValue}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={s.hr} />
    </>
  );
}

function Party({
  label,
  party,
  flex = 1,
}: {
  label: string;
  party: PartyBlock;
  /** Column width relative to the other blocks on the row. */
  flex?: number;
}) {
  const contact = join([party.phone, party.email]);
  return (
    <View style={[s.party, { flex }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.partyName}>{party.name}</Text>
      {party.address ? <Text style={s.soft}>{party.address}</Text> : null}
      {contact ? <Text style={s.soft}>{contact}</Text> : null}
    </View>
  );
}

function Footer({ company, note }: { company: CompanyBlock; note: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footText}>{company.documentFooter || note}</Text>
      <Text
        style={s.footText}
        render={({ pageNumber, totalPages }) =>
          totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : company.name
        }
      />
    </View>
  );
}

// Exported so the documents can be rendered outside the browser (tests, or a
// future email/attachment path) without going through the download button.
export function InvoiceDoc({ data }: { data: InvoiceData }) {
  const company = { ...DEFAULT_COMPANY, ...(data.company ?? {}) };
  const settled = data.status === "PAID";
  const terms = company.paymentTerms || "Due upon receipt";
  // Only worth its own column when it actually differs from the billing address.
  const showService = !!data.serviceAddress && data.serviceAddress !== data.address;

  return (
    <Document
      title={`Invoice ${data.invoiceNo} — ${data.clientName}`}
      author={company.name}
      subject={`${data.serviceName} on ${data.jobDate}`}
    >
      <Page size="LETTER" style={s.page}>
        <Masthead
          company={company}
          docTitle="INVOICE"
          meta={[
            { label: "Invoice no.", value: data.invoiceNo },
            { label: "Issued", value: data.issuedAt },
            { label: "Terms", value: terms },
          ]}
        />

        <View style={s.parties}>
          {/* The client block carries the longest lines (name, street, email),
              so it gets the widest column. */}
          <Party
            label="BILL TO"
            flex={1.35}
            party={{
              name: data.clientName,
              address: data.address,
              phone: data.clientPhone,
              email: data.clientEmail,
            }}
          />
          {showService ? (
            <View style={s.party}>
              <Text style={s.label}>SERVICE LOCATION</Text>
              <Text style={s.soft}>{data.serviceAddress}</Text>
            </View>
          ) : null}
          <View style={[s.party, { flex: 0.55, paddingRight: 0 }]}>
            <Text style={s.label}>SERVICE DATE</Text>
            <Text style={s.bold}>{data.jobDate}</Text>
          </View>
        </View>

        <View style={s.thead}>
          <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
          <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
        </View>
        {data.lineItems.map((li, i) => (
          <View style={s.tr} key={`${li.description}-${i}`} wrap={false}>
            <View style={s.cDesc}>
              <Text style={s.itemName}>{li.description}</Text>
            </View>
            <Text style={s.cAmt}>{usd(li.amount)}</Text>
          </View>
        ))}

        {/* Kept whole: a totals column split across a page break reads as a
            different number than it is. */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.soft}>Subtotal</Text>
              <Text>{usd(data.total)}</Text>
            </View>
            {/* A "$0.00 received" line is noise on a bill nobody has paid yet. */}
            {data.paid > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.soft}>Payments received</Text>
                <Text style={{ color: GOOD }}>- {usd(data.paid)}</Text>
              </View>
            ) : null}
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>{settled ? "BALANCE" : "BALANCE DUE"}</Text>
              <Text style={s.grandValue}>{usd(data.balance)}</Text>
            </View>
            <View style={s.chipRow}>
              <Text
                style={[s.chip, { backgroundColor: STATUS_COLOR[data.status] ?? NAVY }]}
              >
                {(STATUS_LABEL[data.status] ?? data.status).toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {!settled ? (
          <View style={s.panel} wrap={false}>
            <Text style={s.label}>PAYMENT</Text>
            <Text>{terms}</Text>
            {company.paymentNote ? <Text style={s.soft}>{company.paymentNote}</Text> : null}
          </View>
        ) : null}

        <Footer
          company={company}
          note={`Thank you for your business. Questions about this invoice? Contact ${midSentence(
            company.name
          )}.`}
        />
      </Page>
    </Document>
  );
}

export function ReceiptDoc({ data }: { data: ReceiptData }) {
  const company = { ...DEFAULT_COMPANY, ...(data.company ?? {}) };
  const cleared = data.balanceAfter <= 0;

  return (
    <Document
      title={`Receipt ${data.receiptNo} — ${data.clientName}`}
      author={company.name}
      subject={`Payment for ${data.serviceName} on ${data.jobDate}`}
    >
      <Page size="LETTER" style={s.page}>
        <Masthead
          company={company}
          docTitle="RECEIPT"
          meta={[
            { label: "Receipt no.", value: data.receiptNo },
            { label: "Date paid", value: data.paidAt },
            { label: "Against invoice", value: data.invoiceNo },
          ]}
        />

        <View style={s.parties}>
          <Party
            label="RECEIVED FROM"
            flex={1.2}
            party={{
              name: data.clientName,
              address: data.address,
              phone: data.clientPhone,
              email: data.clientEmail,
            }}
          />
          <View style={[s.party, { flex: 0.9, paddingRight: 0 }]}>
            <Text style={s.label}>FOR</Text>
            <Text style={s.bold}>{data.serviceName}</Text>
            <Text style={s.soft}>Serviced {data.jobDate}</Text>
          </View>
        </View>

        {/* The amount is the whole point of a receipt, so it leads rather than
            arriving at the bottom of a totals column. */}
        <View style={[s.grandRow, { marginTop: 20 }]}>
          <Text style={s.grandLabel}>AMOUNT RECEIVED</Text>
          <Text style={s.grandValue}>{usd(data.amount)}</Text>
        </View>

        <View style={s.thead}>
          <Text style={[s.th, s.cDesc]}>PAYMENT DETAIL</Text>
          <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
        </View>
        <View style={s.tr} wrap={false}>
          <View style={s.cDesc}>
            <Text style={s.itemName}>
              {data.method}
              {data.checkNumber ? `  ·  No. ${data.checkNumber}` : ""}
            </Text>
            <Text style={s.itemSub}>
              {join([
                `Received ${data.paidAt}`,
                data.recordedBy ? `by ${data.recordedBy}` : null,
              ])}
            </Text>
          </View>
          <Text style={s.cAmt}>{usd(data.amount)}</Text>
        </View>

        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.soft}>Invoice total</Text>
              <Text>{usd(data.invoiceTotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.soft}>This payment</Text>
              <Text style={{ color: GOOD }}>- {usd(data.amount)}</Text>
            </View>
            <View
              style={[
                s.totalRow,
                { borderTopWidth: 1, borderColor: RULE, paddingTop: 5, marginTop: 2 },
              ]}
            >
              <Text style={s.bold}>Balance remaining</Text>
              <Text style={s.bold}>{usd(Math.max(0, data.balanceAfter))}</Text>
            </View>
            <View style={s.chipRow}>
              <Text style={[s.chip, { backgroundColor: cleared ? GOOD : WARN }]}>
                {cleared ? "PAID IN FULL" : "BALANCE OUTSTANDING"}
              </Text>
            </View>
          </View>
        </View>

        {data.note ? (
          <View style={s.panel} wrap={false}>
            <Text style={s.label}>NOTE</Text>
            <Text>{data.note}</Text>
          </View>
        ) : null}

        <Footer
          company={company}
          note={`This receipt confirms payment received by ${midSentence(company.name)}.`}
        />
      </Page>
    </Document>
  );
}

function DownloadButton({
  label,
  filename,
  doc,
  className,
}: {
  label: string;
  filename: string;
  doc: React.ReactElement;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const blob = await pdf(doc).toBlob();
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
      doc={<InvoiceDoc data={data} />}
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
      doc={<ReceiptDoc data={data} />}
      className={className}
    />
  );
}
