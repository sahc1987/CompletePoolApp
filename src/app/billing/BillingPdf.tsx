"use client";

import { useState } from "react";
import QRCode from "qrcode";
import {
  Document,
  Image,
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
// payment) share a masthead, detail panel, table styling and footer, so the
// chrome lives in one place and each document only describes its own middle.

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
  /** `detail` prints smaller beneath the description, e.g. "2 gallon × $9.00". */
  lineItems: { description: string; detail?: string; amount: number }[];
  /** Pre-tax; equals `total` when there's no tax. */
  subtotal?: number;
  /** Printed between Subtotal and Total. Empty on an untaxed bill. */
  taxes?: { name: string; ratePercent: number; amount: number }[];
  total: number;
  paid: number;
  balance: number;
  status: "PENDING" | "PARTIAL" | "PAID";
  /** Customer's online pay link; printed with a QR code while unpaid. */
  payUrl?: string | null;
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

// Brand navy, matching the app chrome and the logo's water. Ink is near-black
// rather than pure black — pure black on white prints harshly.
const NAVY = "#1c3f7a";
const NAVY_DEEP = "#0f2a55";
const TEAL = "#0e7490";
const INK = "#182233";
const MUTED = "#5b6784";
const RULE = "#dfe5ee";
const PANEL = "#f4f7fb";
const ZEBRA = "#f9fafc";
const GOOD = "#166534";
const GOOD_TINT = "#eef7f1";
const DANGER = "#b3261e";
// A part-paid bill isn't a problem, so it reads amber rather than red.
const WARN = "#a16207";

const STATUS_COLOR: Record<string, string> = {
  PENDING: DANGER,
  PARTIAL: WARN,
  PAID: GOOD,
};

// The header logo's artwork spans 470 × 130 of its 620-wide viewBox (the rest
// is empty space). It's cropped to that and prints at this width.
const LOGO_SRC_W = 470;
const LOGO_SRC_H = 130;
const LOGO_W = 204;
const LOGO_H = (LOGO_W * LOGO_SRC_H) / LOGO_SRC_W;

const s = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingHorizontal: 48,
    paddingBottom: 86,
    fontSize: 9.5,
    lineHeight: 1.45,
    color: INK,
    fontFamily: "Helvetica",
  },

  // Full-bleed brand strip along the top edge of every page.
  strip: { position: "absolute", top: 0, left: 0, right: 0, height: 7, flexDirection: "row" },
  stripNavy: { flex: 1, backgroundColor: NAVY },
  stripTeal: { width: 140, backgroundColor: TEAL },

  // --- masthead ---
  masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flex: 1, paddingRight: 24 },
  brandName: { fontSize: 17, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.2 },
  brandTag: { fontSize: 8.5, color: TEAL, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginTop: 5 },
  brandLine: { fontSize: 8.5, color: MUTED },
  brandContact: { marginTop: 5 },

  titleBlock: { alignItems: "flex-end" },
  docTitle: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    letterSpacing: 5,
  },
  docNo: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 2, letterSpacing: 0.6 },

  hr: { height: 1, backgroundColor: RULE, marginTop: 18 },

  // --- parties + detail panel ---
  info: { flexDirection: "row", marginTop: 18 },
  party: { flex: 1, paddingRight: 16 },
  label: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    letterSpacing: 1.3,
    marginBottom: 5,
  },
  partyName: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 2 },
  soft: { color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },

  details: {
    width: 196,
    backgroundColor: PANEL,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  detailLabel: { fontSize: 8.5, color: MUTED },
  detailValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK, textAlign: "right", maxWidth: 110 },

  // --- table ---
  thead: {
    flexDirection: "row",
    backgroundColor: NAVY,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 24,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 1.1 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: RULE,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cNum: { width: 22, color: MUTED },
  cDesc: { flex: 1 },
  cAmt: { width: 90, textAlign: "right" },
  itemName: { fontFamily: "Helvetica-Bold" },
  itemSub: { fontSize: 8, color: MUTED, marginTop: 1.5 },

  // --- summary row: notes on the left, totals on the right ---
  summary: { flexDirection: "row", marginTop: 16, alignItems: "flex-start" },
  notes: { flex: 1, paddingRight: 28 },
  panel: {
    borderLeftWidth: 3,
    borderColor: TEAL,
    backgroundColor: PANEL,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginBottom: 10,
  },
  totals: { width: 236 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 10 },
  totalRule: { borderTopWidth: 1, borderColor: RULE, marginTop: 3, paddingTop: 6 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: NAVY,
    borderRadius: 3,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginTop: 7,
  },
  grandLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 1 },
  grandValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#ffffff" },

  // --- receipt amount band ---
  amountBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: GOOD_TINT,
    borderLeftWidth: 4,
    borderColor: GOOD,
    borderRadius: 3,
  },
  amountLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GOOD, letterSpacing: 1.3 },
  amountValue: { fontSize: 24, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },

  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    color: "#ffffff",
  },

  // A settled document carries a faint diagonal stamp across its middle,
  // drawn last so no panel covers part of it.
  stamp: {
    position: "absolute",
    top: 360,
    left: 168,
    fontSize: 118,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 10,
    color: GOOD,
    opacity: 0.08,
    transform: "rotate(-24deg)",
  },

  payOnline: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: RULE,
    borderRadius: 4,
    padding: 8,
  },
  qr: { width: 64, height: 64, marginRight: 10 },
  payLink: { fontSize: 7.5, color: NAVY, marginTop: 2 },

  thanks: { fontSize: 12, fontFamily: "Helvetica-Oblique", color: NAVY, marginTop: 26 },

  // --- footer ---
  footer: {
    position: "absolute",
    bottom: 30,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderColor: RULE,
    paddingTop: 8,
  },
  footRow: { flexDirection: "row", justifyContent: "space-between" },
  footText: { fontSize: 7.5, color: MUTED },
});

/** "Questions about this invoice? Call 516-… or email office@…" */
function questionsLine(doc: string, company: CompanyBlock) {
  const reach = join(
    [company.phone ? `call ${company.phone}` : null, company.email ? `email ${company.email}` : null],
    " or "
  );
  return reach
    ? `Questions about this ${doc}? Please ${reach}.`
    : `Questions about this ${doc}? Please contact our office.`;
}

/** Joins parts of a contact line, dropping anything blank. */
const join = (parts: (string | null | undefined)[], sep = "  ·  ") =>
  parts.filter((p) => p && String(p).trim()).join(sep);

/**
 * Company names routinely end in "Inc." or "Co.", which collides with the
 * period closing a sentence they're dropped into ("...Complete Pool Service
 * Inc..").
 */
const midSentence = (name: string) => name.replace(/\.\s*$/, "");

function BrandStrip() {
  return (
    <View style={s.strip} fixed>
      <View style={s.stripNavy} />
      <View style={s.stripTeal} />
    </View>
  );
}

function Masthead({
  company,
  logo,
  docTitle,
  docNo,
}: {
  company: CompanyBlock;
  /** PNG data URL of the logo; falls back to the name set in type. */
  logo?: string | null;
  docTitle: string;
  docNo: string;
}) {
  const contact = join([company.phone, company.email]);
  return (
    <>
      <View style={s.masthead}>
        <View style={s.brand}>
          {logo ? (
            // The logo already spells out the company name.
            <Image src={logo} style={{ width: LOGO_W, height: LOGO_H }} />
          ) : (
            <Text style={s.brandName}>{company.name}</Text>
          )}
          {company.tagline ? <Text style={s.brandTag}>{company.tagline.toUpperCase()}</Text> : null}
          <View style={s.brandContact}>
            {company.address ? <Text style={s.brandLine}>{company.address}</Text> : null}
            {contact ? <Text style={s.brandLine}>{contact}</Text> : null}
            {company.website ? <Text style={s.brandLine}>{company.website}</Text> : null}
            {company.taxId ? <Text style={s.brandLine}>Tax ID {company.taxId}</Text> : null}
          </View>
        </View>

        <View style={s.titleBlock}>
          <Text style={s.docTitle}>{docTitle}</Text>
          <Text style={s.docNo}>{docNo}</Text>
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
  return (
    <View style={[s.party, { flex }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.partyName}>{party.name}</Text>
      {party.address ? <Text style={s.soft}>{party.address}</Text> : null}
      {party.phone ? <Text style={s.soft}>{party.phone}</Text> : null}
      {party.email ? <Text style={s.soft}>{party.email}</Text> : null}
    </View>
  );
}

/** The boxed reference panel on the right of the party row. */
function Details({ rows }: { rows: { label: string; value: string; color?: string }[] }) {
  return (
    <View style={s.details}>
      {rows.map((r) => (
        <View style={s.detailRow} key={r.label}>
          <Text style={s.detailLabel}>{r.label}</Text>
          <Text style={[s.detailValue, r.color ? { color: r.color } : {}]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Footer({ company, note }: { company: CompanyBlock; note: string }) {
  const contact = join([company.name, company.phone, company.email, company.website]);
  return (
    <View style={s.footer} fixed>
      <Text style={[s.footText, { marginBottom: 3 }]}>{company.documentFooter || note}</Text>
      <View style={s.footRow}>
        <Text style={s.footText}>{contact}</Text>
        <Text
          style={s.footText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </View>
  );
}

// Exported so the documents can be rendered outside the browser (tests, or a
// future email/attachment path) without going through the download button.
export function InvoiceDoc({
  data,
  logo,
  qr,
}: {
  data: InvoiceData;
  logo?: string | null;
  /** PNG data URL of a QR code for `data.payUrl`. */
  qr?: string | null;
}) {
  const company = { ...DEFAULT_COMPANY, ...(data.company ?? {}) };
  const settled = data.status === "PAID";
  const terms = company.paymentTerms || "Due upon receipt";
  // Only worth its own column when it actually differs from the billing address.
  const showService = !!data.serviceAddress && data.serviceAddress !== data.address;
  const taxes = data.taxes ?? [];

  return (
    <Document
      title={`Invoice ${data.invoiceNo} — ${data.clientName}`}
      author={company.name}
      subject={`${data.serviceName} on ${data.jobDate}`}
    >
      <Page size="LETTER" style={s.page}>
        <BrandStrip />

        <Masthead company={company} logo={logo} docTitle="INVOICE" docNo={data.invoiceNo} />

        <View style={s.info}>
          {/* The client block carries the longest lines (name, street, email),
              so it gets the widest column. */}
          <Party
            label="BILL TO"
            flex={1.3}
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
          <Details
            rows={[
              { label: "Invoice date", value: data.issuedAt },
              { label: "Service date", value: data.jobDate },
              { label: "Terms", value: terms },
              {
                label: "Status",
                value: STATUS_LABEL[data.status] ?? data.status,
                color: STATUS_COLOR[data.status],
              },
            ]}
          />
        </View>

        <View style={s.thead}>
          <Text style={[s.cNum, s.th]}>#</Text>
          <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
          <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
        </View>
        {data.lineItems.map((li, i) => (
          <View
            style={[s.tr, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]}
            key={`${li.description}-${i}`}
            wrap={false}
          >
            <Text style={s.cNum}>{i + 1}</Text>
            <View style={s.cDesc}>
              <Text style={s.itemName}>{li.description}</Text>
              {li.detail ? <Text style={s.itemSub}>{li.detail}</Text> : null}
            </View>
            <Text style={s.cAmt}>{usd(li.amount)}</Text>
          </View>
        ))}

        {/* Kept whole: a totals column split across a page break reads as a
            different number than it is. */}
        <View style={s.summary} wrap={false}>
          <View style={s.notes}>
            {settled ? (
              <View style={s.panel}>
                <Text style={s.label}>PAYMENT RECEIVED</Text>
                <Text>This invoice has been paid in full. Thank you.</Text>
              </View>
            ) : (
              <View style={s.panel}>
                <Text style={s.label}>PAYMENT</Text>
                <Text style={s.bold}>{terms}</Text>
                {company.paymentNote ? (
                  <Text style={[s.soft, { marginTop: 2 }]}>{company.paymentNote}</Text>
                ) : null}
                <Text style={[s.soft, { marginTop: 4 }]}>
                  Please reference {data.invoiceNo} with your payment.
                </Text>
              </View>
            )}
            {!settled && data.payUrl ? (
              <View style={s.payOnline}>
                {qr ? <Image src={qr} style={s.qr} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>PAY ONLINE BY CARD</Text>
                  <Text>Scan the code or open the link to pay securely.</Text>
                  <Text style={s.payLink}>{data.payUrl}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.soft}>Subtotal</Text>
              <Text>{usd(data.subtotal ?? data.total)}</Text>
            </View>
            {taxes.map((t) => (
              <View style={s.totalRow} key={t.name}>
                <Text style={s.soft}>
                  {t.name} ({t.ratePercent}%)
                </Text>
                <Text>{usd(t.amount)}</Text>
              </View>
            ))}
            <View style={[s.totalRow, s.totalRule]}>
              <Text style={s.bold}>Total</Text>
              <Text style={s.bold}>{usd(data.total)}</Text>
            </View>
            {/* A "$0.00 received" line is noise on a bill nobody has paid yet. */}
            {data.paid > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.soft}>Payments received</Text>
                <Text style={{ color: GOOD }}>- {usd(data.paid)}</Text>
              </View>
            ) : null}
            <View style={[s.grandRow, settled ? { backgroundColor: GOOD } : {}]}>
              <Text style={s.grandLabel}>{settled ? "BALANCE" : "BALANCE DUE"}</Text>
              <Text style={s.grandValue}>{usd(data.balance)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.thanks}>Thank you for your business.</Text>
        {settled ? <Text style={s.stamp}>PAID</Text> : null}

        <Footer
          company={company}
          note={questionsLine("invoice", company)}
        />
      </Page>
    </Document>
  );
}

export function ReceiptDoc({ data, logo }: { data: ReceiptData; logo?: string | null }) {
  const company = { ...DEFAULT_COMPANY, ...(data.company ?? {}) };
  const cleared = data.balanceAfter <= 0;
  // What had already come in before this payment, for the running account.
  const previously = Math.max(
    0,
    Math.round((data.invoiceTotal - data.amount - Math.max(0, data.balanceAfter)) * 100) / 100
  );

  return (
    <Document
      title={`Receipt ${data.receiptNo} — ${data.clientName}`}
      author={company.name}
      subject={`Payment for ${data.serviceName} on ${data.jobDate}`}
    >
      <Page size="LETTER" style={s.page}>
        <BrandStrip />

        <Masthead company={company} logo={logo} docTitle="RECEIPT" docNo={data.receiptNo} />

        <View style={s.info}>
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
          <View style={s.party}>
            <Text style={s.label}>FOR</Text>
            <Text style={s.bold}>{data.serviceName}</Text>
            <Text style={s.soft}>Serviced {data.jobDate}</Text>
            {data.serviceAddress ? <Text style={s.soft}>{data.serviceAddress}</Text> : null}
          </View>
          <Details
            rows={[
              { label: "Date paid", value: data.paidAt },
              { label: "Method", value: data.method },
              ...(data.checkNumber ? [{ label: "Check no.", value: data.checkNumber }] : []),
              { label: "Invoice", value: data.invoiceNo },
            ]}
          />
        </View>

        {/* The amount is the whole point of a receipt, so it leads rather than
            arriving at the bottom of a totals column. */}
        <View style={s.amountBand}>
          <View>
            <Text style={s.amountLabel}>AMOUNT RECEIVED</Text>
            <Text style={s.amountValue}>{usd(data.amount)}</Text>
          </View>
          <Text style={[s.chip, { backgroundColor: cleared ? GOOD : WARN }]}>
            {cleared ? "PAID IN FULL" : "BALANCE OUTSTANDING"}
          </Text>
        </View>

        <View style={s.thead}>
          <Text style={[s.th, s.cDesc]}>ACCOUNT SUMMARY</Text>
          <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
        </View>
        <View style={s.tr}>
          <Text style={s.cDesc}>Invoice {data.invoiceNo} total</Text>
          <Text style={s.cAmt}>{usd(data.invoiceTotal)}</Text>
        </View>
        {previously > 0 ? (
          <View style={[s.tr, { backgroundColor: ZEBRA }]}>
            <Text style={s.cDesc}>Previously paid</Text>
            <Text style={[s.cAmt, { color: GOOD }]}>- {usd(previously)}</Text>
          </View>
        ) : null}
        <View style={s.tr}>
          <View style={s.cDesc}>
            <Text style={s.itemName}>
              This payment  ·  {data.method}
              {data.checkNumber ? ` No. ${data.checkNumber}` : ""}
            </Text>
            <Text style={s.itemSub}>
              {join([
                `Received ${data.paidAt}`,
                data.recordedBy ? `by ${data.recordedBy}` : null,
              ])}
            </Text>
          </View>
          <Text style={[s.cAmt, { color: GOOD }]}>- {usd(data.amount)}</Text>
        </View>

        <View style={s.summary} wrap={false}>
          <View style={s.notes}>
            {data.note ? (
              <View style={s.panel}>
                <Text style={s.label}>NOTE</Text>
                <Text>{data.note}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.totals}>
            <View style={[s.grandRow, { marginTop: 0 }, cleared ? { backgroundColor: GOOD } : {}]}>
              <Text style={s.grandLabel}>BALANCE REMAINING</Text>
              <Text style={s.grandValue}>{usd(Math.max(0, data.balanceAfter))}</Text>
            </View>
          </View>
        </View>

        <Text style={s.thanks}>Thank you for your payment.</Text>
        {cleared ? <Text style={s.stamp}>PAID</Text> : null}

        <Footer
          company={company}
          note={`This receipt confirms payment received by ${midSentence(company.name)}. Please keep it for your records.`}
        />
      </Page>
    </Document>
  );
}

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
