import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { card } from "@/components/styles";
import { money, toNumber } from "@/lib/serialize";

function num(v: unknown): number {
  return toNumber(v as never) ?? 0;
}

// Minutes -> a compact "12h 30m" label.
function fmtHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default async function KpiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Only APPROVED tasks are billable — revenue/margin count these alone.
  const approved = await prisma.task.findMany({
    where: { status: "APPROVED" },
    include: {
      worker: { select: { id: true, name: true } },
      extras: true,
      materials: { include: { material: { select: { name: true, unit: true } } } },
    },
  });

  // On-time is measured over everything that's been submitted for review:
  // did the worker finish by the scheduled end time?
  const submitted = await prisma.task.findMany({
    where: { submittedAt: { not: null } },
    select: { submittedAt: true, startTime: true, durationMin: true },
  });

  // Estimates signed by clients (sales pipeline won).
  const approvedEstimates = await prisma.estimate.findMany({
    where: { status: "APPROVED" },
    select: { total: true },
  });

  // --- Aggregate ---
  let revenue = 0;
  let materialCost = 0;
  let materialBilled = 0;
  let totalMinutes = 0;
  const perWorker = new Map<
    string,
    { name: string; revenue: number; jobs: number; minutes: number }
  >();
  // Which materials the crews actually consumed, rolled up across every
  // approved job.
  const materialsUsed = new Map<
    string,
    { name: string; unit: string; qty: number; cost: number; billed: number }
  >();

  for (const t of approved) {
    const extras = t.extras.reduce((s, e) => s + num(e.priceAtTimeOfSale), 0);
    const matBill = t.materials.reduce(
      (s, m) => s + num(m.customerPriceAtTimeOfUse) * num(m.quantityUsed),
      0
    );
    const matCost = t.materials.reduce(
      (s, m) => s + num(m.costPriceAtTimeOfUse) * num(m.quantityUsed),
      0
    );
    const taskRevenue = num(t.price) + extras + matBill;
    revenue += taskRevenue;
    materialCost += matCost;
    materialBilled += matBill;
    totalMinutes += t.durationMin;

    const w =
      perWorker.get(t.worker.id) ??
      { name: t.worker.name, revenue: 0, jobs: 0, minutes: 0 };
    w.revenue += taskRevenue;
    w.jobs += 1;
    w.minutes += t.durationMin;
    perWorker.set(t.worker.id, w);

    for (const m of t.materials) {
      const e =
        materialsUsed.get(m.materialId) ??
        { name: m.material.name, unit: m.material.unit, qty: 0, cost: 0, billed: 0 };
      e.qty += num(m.quantityUsed);
      e.cost += num(m.costPriceAtTimeOfUse) * num(m.quantityUsed);
      e.billed += num(m.customerPriceAtTimeOfUse) * num(m.quantityUsed);
      materialsUsed.set(m.materialId, e);
    }
  }

  const margin = revenue - materialCost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  const materials = [...materialsUsed.values()].sort((a, b) => b.billed - a.billed);

  const onTimeCount = submitted.filter((t) => {
    if (!t.submittedAt) return false;
    const end = new Date(t.startTime.getTime() + t.durationMin * 60_000);
    return t.submittedAt <= end;
  }).length;
  const onTimePct = submitted.length > 0 ? (onTimeCount / submitted.length) * 100 : 0;

  const salesTotal = approvedEstimates.reduce((s, e) => s + num(e.total), 0);

  const workers = [...perWorker.values()].sort((a, b) => b.revenue - a.revenue);
  const maxWorkerRev = workers[0]?.revenue ?? 0;

  const stats = [
    { label: "Approved revenue", value: money(revenue), sub: `${approved.length} billable jobs` },
    { label: "Gross margin", value: money(margin), sub: `${marginPct.toFixed(0)}% (after materials)` },
    { label: "Labor hours", value: fmtHours(totalMinutes), sub: `across ${approved.length} approved jobs` },
    { label: "Materials billed", value: money(materialBilled), sub: `${money(materialCost)} cost` },
    { label: "On-time rate", value: `${onTimePct.toFixed(0)}%`, sub: `${onTimeCount}/${submitted.length} submitted on time` },
    { label: "Signed estimates", value: money(salesTotal), sub: `${approvedEstimates.length} won` },
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
