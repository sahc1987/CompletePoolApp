"use client";

import { useState } from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

export type EstimatePdfData = {
  number: string;
  clientName: string;
  address?: string | null;
  createdBy: string;
  createdAt: string;
  validUntil?: string | null;
  notes?: string | null;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  taxes: { name: string; ratePercent: number; amount: number }[];
  subtotal: number;
  taxTotal: number;
  total: number;
  signedByName?: string | null;
  signatureData?: string | null;
  signedAt?: string | null;
};

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a2333", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  company: { fontSize: 16, fontWeight: "bold", color: "#1c3f7a" },
  h2: { fontSize: 13, fontWeight: "bold", marginBottom: 4 },
  muted: { color: "#6b7280" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#dbe3ee", paddingVertical: 5 },
  cDesc: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cUnit: { flex: 1.4, textAlign: "right" },
  cAmt: { flex: 1.4, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { fontSize: 12, fontWeight: "bold", color: "#1c3f7a", borderTopWidth: 1, borderTopColor: "#1c3f7a", paddingTop: 4, marginTop: 4 },
  sigBox: { marginTop: 30, borderTopWidth: 1, borderTopColor: "#dbe3ee", paddingTop: 12 },
  sigImg: { width: 180, height: 60, marginTop: 6 },
});

function EstimateDoc({ data }: { data: EstimatePdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.company}>Complete Pool Service Inc.</Text>
            <Text style={s.muted}>Estimate #{data.number}</Text>
          </View>
          <View>
            <Text>Date: {data.createdAt}</Text>
            {data.validUntil ? <Text>Valid until: {data.validUntil}</Text> : null}
            <Text>Prepared by: {data.createdBy}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={s.h2}>Bill to</Text>
          <Text>{data.clientName}</Text>
          {data.address ? <Text style={s.muted}>{data.address}</Text> : null}
        </View>

        <View style={[s.row, { borderBottomWidth: 2, borderBottomColor: "#1a2333" }]}>
          <Text style={s.cDesc}>Description</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cUnit}>Unit</Text>
          <Text style={s.cAmt}>Amount</Text>
        </View>
        {data.lineItems.map((li, i) => (
          <View style={s.row} key={i}>
            <Text style={s.cDesc}>{li.description}</Text>
            <Text style={s.cQty}>{li.quantity}</Text>
            <Text style={s.cUnit}>{usd(li.unitPrice)}</Text>
            <Text style={s.cAmt}>{usd(li.quantity * li.unitPrice)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Subtotal</Text>
            <Text>{usd(data.subtotal)}</Text>
          </View>
          {data.taxes.map((t, i) => (
            <View style={s.totalRow} key={i}>
              <Text style={s.muted}>{t.name} ({t.ratePercent}%)</Text>
              <Text>{usd(t.amount)}</Text>
            </View>
          ))}
          <View style={[s.totalRow, s.grand]}>
            <Text>Total</Text>
            <Text>{usd(data.total)}</Text>
          </View>
        </View>

        {data.notes ? (
          <View style={{ marginTop: 20 }}>
            <Text style={s.h2}>Notes</Text>
            <Text style={s.muted}>{data.notes}</Text>
          </View>
        ) : null}

        {data.signatureData ? (
          <View style={s.sigBox}>
            <Text style={s.h2}>Approved & signed</Text>
            <Text>{data.signedByName}{data.signedAt ? ` — ${data.signedAt}` : ""}</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={data.signatureData} style={s.sigImg} />
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export default function EstimatePdf({ data }: { data: EstimatePdfData }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const blob = await pdf(<EstimateDoc data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimate-${data.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      className="rounded-full bg-gradient-to-b from-teal-700 to-teal-800 px-5 py-2.5 font-bold text-white shadow-sm transition hover:from-teal-800 hover:to-teal-900 disabled:opacity-60"
    >
      {busy ? "Generating…" : "Download PDF"}
    </button>
  );
}
