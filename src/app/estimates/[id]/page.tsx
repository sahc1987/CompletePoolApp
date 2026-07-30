import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
import { card, selectClass } from "@/components/styles";
import { money, toNumber } from "@/lib/serialize";
import LineItemForm from "../LineItemForm";
import SignForm from "../SignForm";
import DeclineForm from "../DeclineForm";
import EstimatePdf, { type EstimatePdfData } from "../EstimatePdf";
import {
  addTax,
  removeTax,
  deleteLineItem,
  presentEstimate,
  backToDraft,
  deleteEstimate,
} from "../actions";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-ink/10 text-muted",
  PRESENTED: "bg-aqua/10 text-aqua",
  APPROVED: "bg-good/10 text-good",
  DECLINED: "bg-danger/10 text-danger",
};

function fmtDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;
}

export default async function EstimateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const estimate = await prisma.estimate.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { name: true } },
      pool: { select: { address: true } },
      createdBy: { select: { name: true } },
      lineItems: { orderBy: { id: "asc" } },
      taxes: { orderBy: { name: "asc" } },
    },
  });
  if (!estimate) notFound();

  const isDraft = estimate.status === "DRAFT";
  const isPresented = estimate.status === "PRESENTED";
  const appliedRateIds = new Set(estimate.taxes.map((t) => t.taxRateId));
  const availableRates = isDraft
    ? (await prisma.taxRate.findMany({ where: { active: true }, orderBy: { name: "asc" } }))
        .filter((r) => !appliedRateIds.has(r.id))
    : [];

  // Catalog for line-item autosuggest: services, extras, and materials with
  // their customer-facing price. Picking one auto-fills the unit price.
  const [svc, ext, mat] = isDraft
    ? await Promise.all([
        prisma.service.findMany({ orderBy: { name: "asc" } }),
        prisma.extraService.findMany({ orderBy: { name: "asc" } }),
        prisma.material.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      ])
    : [[], [], []];
  const catalog = [
    ...svc.map((s) => ({ name: s.name, price: toNumber(s.basePrice) ?? 0, kind: "Service" })),
    ...ext.map((e) => ({ name: e.name, price: toNumber(e.price) ?? 0, kind: "Extra" })),
    ...mat.map((m) => ({ name: m.name, price: toNumber(m.customerPrice) ?? 0, kind: "Material" })),
  ];

  const pdfData: EstimatePdfData = {
    number: estimate.id.slice(-6).toUpperCase(),
    clientName: estimate.client.name,
    address: estimate.pool?.address ?? null,
    createdBy: estimate.createdBy.name,
    createdAt: fmtDate(estimate.createdAt) ?? "",
    validUntil: fmtDate(estimate.validUntil),
    notes: estimate.notes,
    lineItems: estimate.lineItems.map((li) => ({
      description: li.description,
      quantity: toNumber(li.quantity) ?? 0,
      unitPrice: toNumber(li.unitPrice) ?? 0,
    })),
    taxes: estimate.taxes.map((t) => ({
      name: t.name,
      ratePercent: toNumber(t.ratePercent) ?? 0,
      amount: toNumber(t.amount) ?? 0,
    })),
    subtotal: toNumber(estimate.subtotal) ?? 0,
    taxTotal: toNumber(estimate.taxTotal) ?? 0,
    total: toNumber(estimate.total) ?? 0,
    signedByName: estimate.signedByName,
    signatureData: estimate.signatureData,
    signedAt: fmtDate(estimate.signedAt),
  };

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted">
        <Link href="/estimates" className="hover:underline">Estimates</Link>
        <span>/</span>
        <span className="text-ink">{estimate.client.name}</span>
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[estimate.status]}`}>
          {estimate.status[0] + estimate.status.slice(1).toLowerCase()}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Line items + taxes */}
        <div className="space-y-6 lg:col-span-2">
          <section className={card}>
            <h2 className="mb-4 text-lg font-semibold text-ink">Line items</h2>
            {estimate.lineItems.length === 0 ? (
              <p className="text-sm text-muted">No line items yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {estimate.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-line last:border-0">
                      <td className="py-2">{li.description}</td>
                      <td className="py-2 text-right text-muted">{toNumber(li.quantity)}</td>
                      <td className="py-2 text-right text-muted">{money(li.unitPrice)}</td>
                      <td className="py-2 text-right font-medium">
                        {money((toNumber(li.quantity) ?? 0) * (toNumber(li.unitPrice) ?? 0))}
                      </td>
                      {isDraft && (
                        <td className="py-2 pl-2 text-right">
                          <form action={deleteLineItem}>
                            <input type="hidden" name="id" value={li.id} />
                            <input type="hidden" name="estimateId" value={estimate.id} />
                            <button className="text-danger hover:underline" type="submit">×</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {isDraft && (
              <div className="mt-4 border-t border-line pt-4">
                <LineItemForm estimateId={estimate.id} catalog={catalog} />
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className="mb-1 text-lg font-semibold text-ink">Taxes</h2>
            <p className="mb-4 text-sm text-muted">
              Not taxable by default — add rates that apply to this job.
            </p>
            {estimate.taxes.length === 0 ? (
              <p className="text-sm text-muted">No taxes applied.</p>
            ) : (
              <ul className="space-y-2">
                {estimate.taxes.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span>{t.name} <span className="text-faint">({toNumber(t.ratePercent)}%)</span></span>
                    <span className="flex items-center gap-3">
                      <span className="text-muted">{money(t.amount)}</span>
                      {isDraft && (
                        <form action={removeTax}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="estimateId" value={estimate.id} />
                          <button className="text-danger hover:underline" type="submit">×</button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {isDraft && availableRates.length > 0 && (
              <form action={addTax} className="mt-4 flex gap-2 border-t border-line pt-4">
                <select name="taxRateId" className={selectClass} defaultValue="">
                  <option value="" disabled>Add a tax rate…</option>
                  {availableRates.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({toNumber(r.rate)}%)</option>
                  ))}
                </select>
                <input type="hidden" name="estimateId" value={estimate.id} />
                <button className="rounded-full border border-line bg-white px-5 py-2 font-semibold text-ink hover:bg-chrome-100" type="submit">
                  Add
                </button>
              </form>
            )}
          </section>
        </div>

        {/* Summary + workflow */}
        <div className="space-y-6">
          <section className={card}>
            <h2 className="mb-4 text-lg font-semibold text-ink">Summary</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(estimate.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{money(estimate.taxTotal)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 text-base font-bold text-navy-700">
                <dt>Total</dt><dd>{money(estimate.total)}</dd>
              </div>
            </dl>
            {estimate.pool && <p className="mt-3 text-xs text-faint">{estimate.pool.address}</p>}
            {estimate.validUntil && (
              <p className="text-xs text-faint">Valid until {fmtDate(estimate.validUntil)}</p>
            )}
          </section>

          {isDraft && (
            <section className={card}>
              <h2 className="mb-4 text-lg font-semibold text-ink">Workflow</h2>
              <div className="space-y-3">
                <ActionForm
                  action={presentEstimate}
                  hidden={{ estimateId: estimate.id }}
                  label="Present to client"
                  pendingLabel="Presenting…"
                />
                <p className="text-xs text-faint">
                  Locks the numbers and opens the in-person signature step.
                </p>
                <div className="border-t border-line pt-3">
                  <DeleteButton
                    action={deleteEstimate}
                    hidden={{ estimateId: estimate.id }}
                    confirm="Delete this draft estimate?"
                    label="Delete draft"
                  />
                </div>
              </div>
            </section>
          )}

          {isPresented && (
            <>
              <section className={card}>
                <h2 className="mb-4 text-lg font-semibold text-ink">Client sign-off</h2>
                <SignForm estimateId={estimate.id} />
              </section>
              <section className={card}>
                <h2 className="mb-4 text-lg font-semibold text-ink">Or…</h2>
                <div className="space-y-4">
                  <DeclineForm estimateId={estimate.id} />
                  <div className="border-t border-line pt-3">
                    <ActionForm
                      action={backToDraft}
                      hidden={{ estimateId: estimate.id }}
                      label="Back to draft"
                      variant="ghost"
                      pendingLabel="…"
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {estimate.status === "APPROVED" && (
            <section className={card}>
              <h2 className="mb-3 text-lg font-semibold text-ink">Signed</h2>
              <p className="text-sm text-muted">
                {estimate.signedByName} · {fmtDate(estimate.signedAt)}
              </p>
              {estimate.signatureData && (
                <img
                  src={estimate.signatureData}
                  alt="Signature"
                  className="mt-3 h-20 rounded border border-line bg-white"
                />
              )}
            </section>
          )}

          {estimate.status === "DECLINED" && (
            <section className={card}>
              <h2 className="mb-2 text-lg font-semibold text-ink">Declined</h2>
              <p className="text-sm text-muted">
                {estimate.declineReason || "No reason given."}
              </p>
            </section>
          )}

          {(estimate.status === "PRESENTED" || estimate.status === "APPROVED") && (
            <section className={card}>
              <h2 className="mb-3 text-lg font-semibold text-ink">Document</h2>
              <EstimatePdf data={pdfData} />
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
