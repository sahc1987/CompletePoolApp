import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import { iso, money, requiredIso, requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";
import type { EstimateStatusValue } from "@/contracts/enums";
import { listTaxRates, type TaxRateRow } from "./catalogReads";

// Estimates are built and presented by whoever is in front of the customer.
const STAFF = ["ADMIN", "WORKER"] as const;

export type EstimateListRow = {
  id: string;
  status: EstimateStatusValue;
  clientName: string;
  createdByName: string;
  /** Null until the estimate has been priced. */
  total: number | null;
  createdAt: string;
  presentedAt: string | null;
  signedAt: string | null;
  validUntil: string | null;
};

export type EstimateLineItemRow = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** quantity x unitPrice, so a caller never multiplies money itself. */
  amount: number;
};

export type EstimateTaxRow = {
  id: string;
  taxRateId: string | null;
  /** Snapshotted when applied, so a later catalog change can't rewrite it. */
  name: string;
  ratePercent: number;
  amount: number;
};

export type EstimateDetail = {
  id: string;
  status: EstimateStatusValue;
  clientId: string;
  clientName: string;
  poolAddress: string | null;
  createdByName: string;
  notes: string | null;
  validUntil: string | null;
  createdAt: string;
  presentedAt: string | null;
  signedByName: string | null;
  /** Base64 PNG from the signature pad — the same contract on web and mobile. */
  signatureData: string | null;
  signedAt: string | null;
  declineReason: string | null;
  respondedAt: string | null;
  convertedTaskId: string | null;
  lineItems: EstimateLineItemRow[];
  taxes: EstimateTaxRow[];
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  /** Editable — only a DRAFT accepts line item and tax changes. */
  isDraft: boolean;
  /** Awaiting an in-person signature or decline. */
  isPresented: boolean;
  /** Active rates not already applied. Empty unless the estimate is a draft. */
  availableTaxRates: TaxRateRow[];
};

export async function listEstimates(
  actor: Actor
): Promise<ServiceResult<EstimateListRow[]>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const estimates = await prisma.estimate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });

  return ok(
    estimates.map((e) => ({
      id: e.id,
      status: e.status as EstimateStatusValue,
      clientName: e.client.name,
      createdByName: e.createdBy.name,
      total: money(e.total),
      createdAt: requiredIso(e.createdAt),
      presentedAt: iso(e.presentedAt),
      signedAt: iso(e.signedAt),
      validUntil: iso(e.validUntil),
    }))
  );
}

export async function getEstimate(
  actor: Actor,
  estimateId: string
): Promise<ServiceResult<EstimateDetail | null>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      client: { select: { id: true, name: true } },
      pool: { select: { address: true } },
      createdBy: { select: { name: true } },
      lineItems: { orderBy: { id: "asc" } },
      taxes: { orderBy: { name: "asc" } },
    },
  });
  if (!estimate) return ok(null);

  const isDraft = estimate.status === "DRAFT";

  // Offering a rate that's already applied would just be refused — the write
  // side won't add the same one twice.
  const applied = new Set(estimate.taxes.map((t) => t.taxRateId));
  const availableTaxRates = isDraft
    ? (await listTaxRates({ activeOnly: true })).filter(
        (r) => !applied.has(r.id)
      )
    : [];

  return ok({
    id: estimate.id,
    status: estimate.status as EstimateStatusValue,
    clientId: estimate.client.id,
    clientName: estimate.client.name,
    poolAddress: estimate.pool?.address ?? null,
    createdByName: estimate.createdBy.name,
    notes: estimate.notes,
    validUntil: iso(estimate.validUntil),
    createdAt: requiredIso(estimate.createdAt),
    presentedAt: iso(estimate.presentedAt),
    signedByName: estimate.signedByName,
    signatureData: estimate.signatureData,
    signedAt: iso(estimate.signedAt),
    declineReason: estimate.declineReason,
    respondedAt: iso(estimate.respondedAt),
    convertedTaskId: estimate.convertedTaskId,
    lineItems: estimate.lineItems.map((li) => {
      const quantity = requiredMoney(li.quantity);
      const unitPrice = requiredMoney(li.unitPrice);
      return {
        id: li.id,
        description: li.description,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
      };
    }),
    taxes: estimate.taxes.map((t) => ({
      id: t.id,
      taxRateId: t.taxRateId,
      name: t.name,
      ratePercent: requiredMoney(t.ratePercent),
      amount: requiredMoney(t.amount),
    })),
    subtotal: money(estimate.subtotal),
    taxTotal: money(estimate.taxTotal),
    total: money(estimate.total),
    isDraft,
    isPresented: estimate.status === "PRESENTED",
    availableTaxRates,
  });
}

/**
 * Autosuggest for the line-item form: every service, add-on and in-use
 * material with its customer-facing price. Picking one fills in the unit
 * price, so a quote priced in the field matches the catalog.
 */
export type LineItemSuggestion = {
  name: string;
  price: number;
  kind: "Service" | "Extra" | "Material";
};

export async function getLineItemCatalog(
  actor: Actor
): Promise<ServiceResult<LineItemSuggestion[]>> {
  const denied = assertRole(actor, ...STAFF);
  if (denied) return denied;

  const [services, extras, materials] = await Promise.all([
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    prisma.extraService.findMany({ orderBy: { name: "asc" } }),
    // Retired materials can't go on new work.
    prisma.material.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return ok([
    ...services.map((s) => ({
      name: s.name,
      price: requiredMoney(s.basePrice),
      kind: "Service" as const,
    })),
    ...extras.map((e) => ({
      name: e.name,
      price: requiredMoney(e.price),
      kind: "Extra" as const,
    })),
    ...materials.map((m) => ({
      name: m.name,
      price: requiredMoney(m.customerPrice),
      kind: "Material" as const,
    })),
  ]);
}
