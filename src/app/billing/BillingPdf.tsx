"use client";

import { useState } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// Invoice (issued when a job is approved and billed) and receipt (issued per
// payment) share a header, totals block and footer, so they live together
// rather than duplicating the layout twice.

export type InvoiceData = {
  invoiceNo: string;
  issuedAt: string;
  clientName: string;
  address?: string | null;
  jobDate: string;
  serviceName: string;
  lineItems: { description: string; amount: number }[];
  total: number;
  paid: number;
  balance: number;
  status: "PENDING" | "PARTIAL" | "PAID";
};

export type ReceiptData = {
  receiptNo: string;
  invoiceNo: string;
  paidAt: string;
  clientName: string;
  address?: string | null;
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
};

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "UNPAID",
  PARTIAL: "PARTIALLY PAID",
  PAID: "PAID IN FULL",
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a2333", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  company: { fontSize: 16, fontWeight: "bold", color: "#1c3f7a" },
  docType: { fontSize: 20, fontWeight: "bold", color: "#1c3f7a", textAlign: "right" },
  muted: { color: "#6b7280" },
  right: { textAlign: "right" },
  section: { marginBottom: 16 },
  h2: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#6b7280",
    letterSpacing: 1,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#dbe3ee",
    paddingVertical: 6,
  },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1c3f7a",
    paddingBottom: 4,
    marginTop: 6,
  },
  cDesc: { flex: 4 },
  cAmt: { flex: 1.4, textAlign: "right" },
  totals: { marginTop: 14, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1c3f7a",
    borderTopWidth: 1,
    borderTopColor: "#1c3f7a",
    paddingTop: 4,
    marginTop: 4,
  },
  stamp: {
    marginTop: 18,
    marginLeft: "auto",
    borderWidth: 2,
    borderColor: "#166534",
    color: "#166534",
    fontSize: 12,
    fontWeight: "bold",
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#dbe3ee",
    paddingTop: 8,
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
  },
});

function Header({ docType, number, dateLabel, date }: {
  docType: string;
  number: string;
  dateLabel: string;
  date: string;
}) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.company}>Complete Pool Service Inc.</Text>
        <Text style={s.muted}>Pool maintenance &amp; repair</Text>
      </View>
      <View>
        <Text style={s.docType}>{docType}</Text>
        <Text style={[s.muted, s.right]}>#{number}</Text>
        <Text style={[s.muted, s.right]}>
          {dateLabel} {date}
        </Text>
      </View>
    </View>
  );
}

// Exported so the documents can be rendered outside the browser (tests, or a
// future email/attachment path) without going through the download button.
export function InvoiceDoc({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header docType="INVOICE" number={data.invoiceNo} dateLabel="Issued" date={data.issuedAt} />

        <View style={s.section}>
          <Text style={s.h2}>BILL TO</Text>
          <Text>{data.clientName}</Text>
          {data.address ? <Text style={s.muted}>{data.address}</Text> : null}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>SERVICE</Text>
          <Text>
            {data.serviceName} · {data.jobDate}
          </Text>
        </View>

        <View style={s.headRow}>
          <Text style={[s.cDesc, { fontWeight: "bold" }]}>Description</Text>
          <Text style={[s.cAmt, { fontWeight: "bold" }]}>Amount</Text>
        </View>
        {data.lineItems.map((li) => (
          <View style={s.row} key={li.description}>
            <Text style={s.cDesc}>{li.description}</Text>
            <Text style={s.cAmt}>{usd(li.amount)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Total</Text>
            <Text>{usd(data.total)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Paid</Text>
            <Text>{usd(data.paid)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>Balance due</Text>
            <Text>{usd(data.balance)}</Text>
          </View>
        </View>

        {data.status === "PAID" ? (
          <Text style={s.stamp}>PAID IN FULL</Text>
        ) : (
          <Text style={[s.totals, s.right, s.muted, { marginTop: 10 }]}>
            {STATUS_LABEL[data.status]}
          </Text>
        )}

        <Text style={s.footer}>
          Thank you for your business. Questions about this invoice? Contact
          Complete Pool Service Inc.
        </Text>
      </Page>
    </Document>
  );
}

export function ReceiptDoc({ data }: { data: ReceiptData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header docType="RECEIPT" number={data.receiptNo} dateLabel="Paid" date={data.paidAt} />

        <View style={s.section}>
          <Text style={s.h2}>RECEIVED FROM</Text>
          <Text>{data.clientName}</Text>
          {data.address ? <Text style={s.muted}>{data.address}</Text> : null}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>FOR</Text>
          <Text>
            {data.serviceName} · {data.jobDate}
          </Text>
          <Text style={s.muted}>Invoice #{data.invoiceNo}</Text>
        </View>

        <View style={s.headRow}>
          <Text style={[s.cDesc, { fontWeight: "bold" }]}>Payment</Text>
          <Text style={[s.cAmt, { fontWeight: "bold" }]}>Amount</Text>
        </View>
        <View style={s.row}>
          <Text style={s.cDesc}>
            {data.method}
            {data.checkNumber ? ` · check #${data.checkNumber}` : ""}
          </Text>
          <Text style={s.cAmt}>{usd(data.amount)}</Text>
        </View>
        {data.note ? (
          <View style={s.row}>
            <Text style={[s.cDesc, s.muted]}>{data.note}</Text>
            <Text style={s.cAmt} />
          </View>
        ) : null}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Invoice total</Text>
            <Text>{usd(data.invoiceTotal)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>Amount received</Text>
            <Text>{usd(data.amount)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Balance remaining</Text>
            <Text>{usd(data.balanceAfter)}</Text>
          </View>
        </View>

        {data.balanceAfter <= 0 ? <Text style={s.stamp}>PAID IN FULL</Text> : null}

        <Text style={s.footer}>
          {data.recordedBy ? `Recorded by ${data.recordedBy}. ` : ""}
          This receipt confirms payment received by Complete Pool Service Inc.
        </Text>
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
