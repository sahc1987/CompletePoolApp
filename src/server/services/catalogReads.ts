import { prisma } from "@/lib/prisma";
import { getWorkHours, type WorkHours } from "@/lib/schedule";
import { assertRole, type Actor } from "@/server/actor";
import { requiredMoney } from "@/server/serialize";
import { ok, type ServiceResult } from "@/server/result";

/**
 * The pickers: services, add-ons, tax rates, active workers, and clients with
 * their pools.
 *
 * Four screens need some subset of these (settings, assign, calendar, the
 * estimate builder) and the mobile app will need the same, so they live here
 * rather than being re-queried per page.
 */

export type ServiceRow = {
  id: string;
  name: string;
  basePrice: number;
  defaultDurationMin: number;
};

export type ExtraServiceRow = {
  id: string;
  name: string;
  price: number;
};

export type TaxRateRow = {
  id: string;
  name: string;
  /** Percentage, e.g. 6.5 for 6.5%. */
  rate: number;
  active: boolean;
};

export type WorkerOption = {
  id: string;
  name: string;
};

export type ClientWithPools = {
  id: string;
  name: string;
  pools: { id: string; address: string }[];
};

export async function listServices(): Promise<ServiceRow[]> {
  const rows = await prisma.service.findMany({ orderBy: { name: "asc" } });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    basePrice: requiredMoney(s.basePrice),
    defaultDurationMin: s.defaultDurationMin,
  }));
}

export async function listExtras(): Promise<ExtraServiceRow[]> {
  const rows = await prisma.extraService.findMany({ orderBy: { name: "asc" } });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    price: requiredMoney(e.price),
  }));
}

/** `activeOnly` for the estimate builder; the settings screen wants them all. */
export async function listTaxRates(
  opts: { activeOnly?: boolean } = {}
): Promise<TaxRateRow[]> {
  const rows = await prisma.taxRate.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    rate: requiredMoney(t.rate),
    active: t.active,
  }));
}

/** Workers who can be assigned new jobs. Disabled accounts are excluded. */
export async function listAssignableWorkers(): Promise<WorkerOption[]> {
  return prisma.user.findMany({
    where: { role: "WORKER", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listClientsWithPools(): Promise<ClientWithPools[]> {
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      pools: { orderBy: { address: "asc" }, select: { id: true, address: true } },
    },
  });
}

export type SchedulingCatalog = {
  clients: ClientWithPools[];
  workers: WorkerOption[];
  services: ServiceRow[];
  extras: ExtraServiceRow[];
  hours: WorkHours;
  /** False when no client has a pool yet — there is nothing to schedule onto. */
  hasClientsWithPools: boolean;
};

/** Everything the assign form needs to render its pickers. */
export async function getSchedulingCatalog(
  actor: Actor
): Promise<ServiceResult<SchedulingCatalog>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const [clients, workers, services, extras, hours] = await Promise.all([
    listClientsWithPools(),
    listAssignableWorkers(),
    listServices(),
    listExtras(),
    getWorkHours(),
  ]);

  return ok({
    clients,
    workers,
    services,
    extras,
    hours,
    hasClientsWithPools: clients.some((c) => c.pools.length > 0),
  });
}

export type BusinessCatalog = {
  services: ServiceRow[];
  extras: ExtraServiceRow[];
  taxRates: TaxRateRow[];
  hours: WorkHours;
};

/** Everything the settings screen edits. */
export async function getBusinessCatalog(
  actor: Actor
): Promise<ServiceResult<BusinessCatalog>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const [services, extras, taxRates, hours] = await Promise.all([
    listServices(),
    listExtras(),
    listTaxRates(),
    getWorkHours(),
  ]);

  return ok({ services, extras, taxRates, hours });
}
