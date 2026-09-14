import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/serialize";
import { assertRole, type Actor } from "@/server/actor";
import { ok, type ServiceResult } from "@/server/result";

/**
 * Business performance, aggregated from approved work.
 *
 * All of this was computed inline in the KPI page. It comes out as plain
 * numbers, unformatted: "$1,234.50" and "12h 30m" are presentation, and a
 * mobile client will render them differently from a desktop table.
 */

const num = (v: unknown): number => toNumber(v as never) ?? 0;

export type WorkerPerformance = {
  id: string;
  name: string;
  revenue: number;
  jobs: number;
  minutes: number;
};

export type MaterialConsumption = {
  materialId: string;
  name: string;
  unit: string;
  qty: number;
  /** What the material cost the company. */
  cost: number;
  /** What the customer was charged for it. */
  billed: number;
};

export type KpiSummary = {
  /** Service price + add-ons + materials, over approved jobs only. */
  revenue: number;
  /** Revenue less material cost. Labor is not deducted. */
  margin: number;
  marginPct: number;
  materialCost: number;
  materialBilled: number;
  totalMinutes: number;
  approvedJobs: number;
  /** Submitted by the scheduled end time, over everything ever submitted. */
  onTimeCount: number;
  submittedCount: number;
  onTimePct: number;
  /** Value of estimates the client signed. */
  signedEstimateTotal: number;
  signedEstimateCount: number;
  /** Highest revenue first. */
  workers: WorkerPerformance[];
  /** Highest billed first. */
  materials: MaterialConsumption[];
};

export async function getKpiSummary(
  actor: Actor
): Promise<ServiceResult<KpiSummary>> {
  const denied = assertRole(actor, "OWNER");
  if (denied) return denied;

  // Only APPROVED tasks are billable — revenue/margin count these alone.
  const approved = await prisma.task.findMany({
    where: { status: "APPROVED" },
    include: {
      worker: { select: { id: true, name: true } },
      extras: true,
      materials: {
        include: { material: { select: { name: true, unit: true } } },
      },
    },
  });

  // On-time is measured over everything that's been submitted for review: did
  // the worker finish by the scheduled end time?
  const submitted = await prisma.task.findMany({
    where: { submittedAt: { not: null } },
    select: { submittedAt: true, startTime: true, durationMin: true },
  });

  // Estimates signed by clients (sales pipeline won).
  const approvedEstimates = await prisma.estimate.findMany({
    where: { status: "APPROVED" },
    select: { total: true },
  });

  let revenue = 0;
  let materialCost = 0;
  let materialBilled = 0;
  let totalMinutes = 0;

  const perWorker = new Map<string, WorkerPerformance>();
  // Which materials the crews actually consumed, rolled up across every
  // approved job.
  const materialsUsed = new Map<string, MaterialConsumption>();

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

    const w = perWorker.get(t.worker.id) ?? {
      id: t.worker.id,
      name: t.worker.name,
      revenue: 0,
      jobs: 0,
      minutes: 0,
    };
    w.revenue += taskRevenue;
    w.jobs += 1;
    w.minutes += t.durationMin;
    perWorker.set(t.worker.id, w);

    for (const m of t.materials) {
      const e = materialsUsed.get(m.materialId) ?? {
        materialId: m.materialId,
        name: m.material.name,
        unit: m.material.unit,
        qty: 0,
        cost: 0,
        billed: 0,
      };
      e.qty += num(m.quantityUsed);
      e.cost += num(m.costPriceAtTimeOfUse) * num(m.quantityUsed);
      e.billed += num(m.customerPriceAtTimeOfUse) * num(m.quantityUsed);
      materialsUsed.set(m.materialId, e);
    }
  }

  const margin = revenue - materialCost;

  const onTimeCount = submitted.filter((t) => {
    if (!t.submittedAt) return false;
    const end = new Date(t.startTime.getTime() + t.durationMin * 60_000);
    return t.submittedAt <= end;
  }).length;

  return ok({
    revenue,
    margin,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
    materialCost,
    materialBilled,
    totalMinutes,
    approvedJobs: approved.length,
    onTimeCount,
    submittedCount: submitted.length,
    onTimePct: submitted.length > 0 ? (onTimeCount / submitted.length) * 100 : 0,
    signedEstimateTotal: approvedEstimates.reduce(
      (s, e) => s + num(e.total),
      0
    ),
    signedEstimateCount: approvedEstimates.length,
    workers: [...perWorker.values()].sort((a, b) => b.revenue - a.revenue),
    materials: [...materialsUsed.values()].sort((a, b) => b.billed - a.billed),
  });
}
