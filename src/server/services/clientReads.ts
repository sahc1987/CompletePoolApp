import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import { ok, type ServiceResult } from "@/server/result";
import { requiredIso } from "@/server/serialize";

/** A row in the client list: the client plus how much hangs off it. */
export type ClientListRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  poolCount: number;
  taskCount: number;
};

export type ClientListPage = {
  rows: ClientListRow[];
  /** Matching the current search. */
  total: number;
  /** Ignoring the search, so the page can say "no matches" vs "no clients". */
  totalUnfiltered: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export type PoolRow = {
  id: string;
  address: string;
  size: string | null;
  type: string | null;
};

export type ClientDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  pools: PoolRow[];
  taskCount: number;
  estimateCount: number;
  /** False once any task or estimate references the client. */
  deletable: boolean;
};

/**
 * One term, matched against everything you'd plausibly search a client by —
 * including the address of any pool they own, since a job is often remembered
 * by where it is rather than by whose name is on the bill.
 */
function searchWhere(query: string): Prisma.ClientWhereInput {
  const q = query.trim();
  if (!q) return {};
  const contains = (field: "name" | "phone" | "email" | "address") =>
    ({ [field]: { contains: q, mode: "insensitive" } }) as Prisma.ClientWhereInput;
  return {
    OR: [
      contains("name"),
      contains("phone"),
      contains("email"),
      contains("address"),
      { pools: { some: { address: { contains: q, mode: "insensitive" } } } },
    ],
  };
}

export async function listClients(
  actor: Actor,
  opts: { query?: string; page?: number; perPage?: number } = {}
): Promise<ServiceResult<ClientListPage>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const query = opts.query ?? "";
  const perPage = Math.max(1, opts.perPage ?? 10);
  const where = searchWhere(query);

  const [total, totalUnfiltered] = await Promise.all([
    prisma.client.count({ where }),
    query ? prisma.client.count() : Promise.resolve(0),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  // Clamp rather than 404: a stale link to page 9 of a list that shrank should
  // land on the last page, not an error.
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { pools: true, tasks: true } } },
    skip: (page - 1) * perPage,
    take: perPage,
  });

  return ok({
    rows: clients.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      poolCount: c._count.pools,
      taskCount: c._count.tasks,
    })),
    total,
    totalUnfiltered: query ? totalUnfiltered : total,
    page,
    perPage,
    totalPages,
  });
}

export async function getClient(
  actor: Actor,
  clientId: string
): Promise<ServiceResult<ClientDetail | null>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      pools: { orderBy: { address: "asc" } },
      _count: { select: { tasks: true, estimates: true } },
    },
  });
  if (!client) return ok(null);

  return ok({
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    address: client.address,
    notes: client.notes,
    createdAt: requiredIso(client.createdAt),
    pools: client.pools.map((p) => ({
      id: p.id,
      address: p.address,
      size: p.size,
      type: p.type,
    })),
    taskCount: client._count.tasks,
    estimateCount: client._count.estimates,
    // Deleting a client removes its pools too, so anything that would be
    // orphaned has to block it — see deleteClient in services/clients.ts.
    deletable: client._count.tasks === 0 && client._count.estimates === 0,
  });
}
