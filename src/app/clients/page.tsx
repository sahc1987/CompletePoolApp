import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Icon } from "@/components/icons";
import { ModalButton } from "@/components/Modal";
import { btnBlue, btnGhost, inputClass } from "@/components/styles";
import ClientForm from "./ClientForm";
import { requirePageSession } from "@/lib/guard";

/**
 * Search and paging both live in the URL, so a filtered page is a real link
 * you can bookmark, share, or come back to. Empty and default values are
 * dropped to keep the common URL short.
 */
function clientsHref(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `/clients?${s}` : "/clients";
}

const PER_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PER = 25;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string; per?: string; page?: string };
}) {
  const session = await requirePageSession("ADMIN");

  const q = (searchParams.q ?? "").trim();

  // One term, matched against everything you'd plausibly search a client by —
  // including the address of any pool they own, since a job is often
  // remembered by where it is rather than by whose name is on the bill.
  const contains = (field: "name" | "phone" | "email" | "address") =>
    ({ [field]: { contains: q, mode: "insensitive" } }) as Prisma.ClientWhereInput;
  const where: Prisma.ClientWhereInput = q
    ? {
        OR: [
          contains("name"),
          contains("phone"),
          contains("email"),
          contains("address"),
          { pools: { some: { address: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};

  const perParam = Number(searchParams.per);
  const per = (PER_OPTIONS as readonly number[]).includes(perParam)
    ? perParam
    : DEFAULT_PER;

  // Count first: the page is clamped against it, so narrowing the search
  // while sitting on page 6 lands you on the last page that still exists
  // instead of on an empty one.
  const [total, totalAll] = await Promise.all([
    prisma.client.count({ where }),
    q ? prisma.client.count() : Promise.resolve(0),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, Number(searchParams.page) || 1), totalPages);
  const start = (page - 1) * per;

  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { pools: true, tasks: true } } },
    skip: start,
    take: per,
  });

  // What every link carries forward. Page is deliberately absent: changing
  // the search or the page size starts you back at page 1.
  const baseParams = {
    q: q || undefined,
    per: per === DEFAULT_PER ? undefined : per,
  };

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Clients &"
        accent="pools"
        subtitle="Everyone you service, and the pools at each address."
        action={
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-muted shadow-sm">
              {q ? `${total} of ${totalAll}` : `${total} total`}
            </span>
            <ModalButton
              label="Add client"
              title="Add a client"
              subtitle="You can add their pools once the client exists."
            >
              <ClientForm />
            </ModalButton>
          </div>
        }
      />

      {/* A plain GET form, so search works before any JS loads. */}
      <form
        method="get"
        action="/clients"
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        {per !== DEFAULT_PER && <input type="hidden" name="per" value={per} />}
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, phone, email, or address"
            aria-label="Search clients"
            className={`${inputClass} pl-9`}
          />
        </div>
        <button type="submit" className={btnBlue}>
          Search
        </button>
        {q && (
          <Link href={clientsHref({ per: baseParams.per })} className={btnGhost}>
            Clear
          </Link>
        )}
      </form>

      {clients.length === 0 ? (
        <p className="text-muted">
          {q
            ? `No clients match “${q}”.`
            : "No clients yet — add your first one above."}
        </p>
      ) : (
        <>
        <div className="overflow-x-auto rounded-2xl border border-line/80 bg-white shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line/70 bg-surface/60 text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3 text-left font-semibold sm:px-5">Name</th>
                <th className="px-4 py-3 text-left font-semibold sm:px-5">Phone</th>
                <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Pools</th>
                <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Tasks</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {clients.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-chrome-100/40">
                  <td className="px-4 py-4 font-semibold text-ink sm:px-5">{c.name}</td>
                  <td className="px-4 py-4 text-muted sm:px-5">{c.phone ?? "—"}</td>
                  <td className="hidden px-5 py-4 text-right tabular-nums text-muted sm:table-cell">{c._count.pools}</td>
                  <td className="hidden px-5 py-4 text-right tabular-nums text-muted sm:table-cell">{c._count.tasks}</td>
                  <td className="px-4 py-4 text-right sm:px-5">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-semibold text-navy-700 hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager. Both halves are links, so a page or size is a real URL you
            can bookmark or share. */}
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Rows per page</span>
            <div className="flex gap-1 rounded-full border border-line bg-white p-1 shadow-sm">
              {PER_OPTIONS.map((n) => (
                <Link
                  key={n}
                  href={clientsHref({
                    ...baseParams,
                    per: n === DEFAULT_PER ? undefined : n,
                  })}
                  className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                    per === n ? "bg-navy-700 text-white" : "text-ink hover:bg-chrome-100"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-muted">
              {start + 1}–{start + clients.length} of {total}
            </span>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link
                  href={clientsHref({ ...baseParams, page: page - 1 })}
                  aria-label="Previous page"
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-white px-2 font-semibold text-ink shadow-sm transition hover:bg-chrome-100 sm:px-3"
                >
                  <Icon name="chevron" size={14} className="rotate-90" />
                  <span className="hidden sm:inline">Previous</span>
                </Link>
              ) : (
                <span className="inline-flex h-8 items-center gap-1 rounded-full border border-line/60 px-2 font-semibold text-faint sm:px-3">
                  <Icon name="chevron" size={14} className="rotate-90" />
                  <span className="hidden sm:inline">Previous</span>
                </span>
              )}
              <span className="px-1 tabular-nums text-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={clientsHref({ ...baseParams, page: page + 1 })}
                  aria-label="Next page"
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-white px-2 font-semibold text-ink shadow-sm transition hover:bg-chrome-100 sm:px-3"
                >
                  <span className="hidden sm:inline">Next</span>
                  <Icon name="chevron" size={14} className="-rotate-90" />
                </Link>
              ) : (
                <span className="inline-flex h-8 items-center gap-1 rounded-full border border-line/60 px-2 font-semibold text-faint sm:px-3">
                  <span className="hidden sm:inline">Next</span>
                  <Icon name="chevron" size={14} className="-rotate-90" />
                </span>
              )}
            </div>
          </div>
        </div>
        </>
      )}
    </AppShell>
  );
}
