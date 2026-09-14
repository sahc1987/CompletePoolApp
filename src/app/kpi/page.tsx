import { getKpiSummary } from "@/server/services/kpi";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { card } from "@/components/styles";
import { money } from "@/lib/serialize";
import { requirePageSession } from "@/lib/guard";

// Minutes -> a compact "12h 30m" label.
function fmtHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default async function KpiPage() {
  const session = await requirePageSession("OWNER");

  // Every figure below is aggregated by the KPI service, so an owner sees the
  // same numbers here and on a phone. This page only formats them.
  const summary = await getKpiSummary(session.user);
  if (!summary.ok) throw new Error(summary.error);
  const {
    revenue,
    margin,
    marginPct,
    materialCost,
    materialBilled,
    totalMinutes,
    approvedJobs,
    onTimeCount,
    submittedCount,
    onTimePct,
    signedEstimateTotal,
    signedEstimateCount,
    workers,
    materials,
  } = summary.data;

  const maxWorkerRev = workers[0]?.revenue ?? 0;

  const stats = [
    { label: "Approved revenue", value: money(revenue), sub: `${approvedJobs} billable jobs` },
    { label: "Gross margin", value: money(margin), sub: `${marginPct.toFixed(0)}% (after materials)` },
    { label: "Labor hours", value: fmtHours(totalMinutes), sub: `across ${approvedJobs} approved jobs` },
    { label: "Materials billed", value: money(materialBilled), sub: `${money(materialCost)} cost` },
    { label: "On-time rate", value: `${onTimePct.toFixed(0)}%`, sub: `${onTimeCount}/${submittedCount} submitted on time` },
    { label: "Signed estimates", value: money(signedEstimateTotal), sub: `${signedEstimateCount} won` },
  ];

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Business"
        accent="dashboard"
        subtitle="Revenue, margin, and worker performance from approved work."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className={card}>
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-navy-700">{s.value}</p>
            <p className="mt-1 text-xs text-faint">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Revenue + hours per worker */}
        <div className={card}>
          <h2 className="mb-4 text-lg font-semibold text-ink">Revenue &amp; hours per worker</h2>
          {workers.length === 0 ? (
            <p className="text-sm text-muted">
              No approved jobs yet — revenue shows up here once admin approves
              submitted work.
            </p>
          ) : (
            <div className="space-y-3">
              {workers.map((w) => (
                <div key={w.name}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="font-medium text-ink">{w.name}</span>
                    <span className="whitespace-nowrap text-muted">
                      {money(w.revenue)} · {fmtHours(w.minutes)} · {w.jobs} job
                      {w.jobs === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-chrome-100">
                    <div
                      className="h-full rounded-full bg-navy-500"
                      style={{ width: `${maxWorkerRev > 0 ? (w.revenue / maxWorkerRev) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Materials consumed across approved jobs */}
        <div className={card}>
          <h2 className="mb-4 text-lg font-semibold text-ink">Materials used</h2>
          {materials.length === 0 ? (
            <p className="text-sm text-muted">
              No materials logged on approved jobs yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line/70 text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 pr-3 text-left font-semibold">Material</th>
                    <th className="px-3 py-2 text-right font-semibold">Used</th>
                    <th className="px-3 py-2 text-right font-semibold">Cost</th>
                    <th className="py-2 pl-3 text-right font-semibold">Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {materials.map((m) => (
                    <tr key={m.name}>
                      <td className="py-2.5 pr-3 font-medium text-ink">{m.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {Number.isInteger(m.qty) ? m.qty : m.qty.toFixed(2)} {m.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {money(m.cost)}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-ink">
                        {money(m.billed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line/70 text-sm font-bold">
                    <td className="py-2.5 pr-3 text-ink">Total</td>
                    <td />
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {money(materialCost)}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-ink">
                      {money(materialBilled)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-faint">
        Revenue = approved task price + extras + materials billed. Margin nets
        out material cost. Labor hours use each job&apos;s scheduled duration.
        On-time = submitted by the scheduled end time.
      </p>
    </AppShell>
  );
}
