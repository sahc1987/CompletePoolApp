import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Icon } from "@/components/icons";
import { ModalButton } from "@/components/Modal";
import { btnBlue, btnGhost, inputClass } from "@/components/styles";
import { money, toNumber } from "@/lib/serialize";
import CatalogForm from "../settings/CatalogForm";
import StockForm from "./StockForm";
import RespondForm from "./RespondForm";
import { saveMaterial, toggleMaterial } from "./actions";
import DeleteButton from "@/components/DeleteButton";
import { requirePageSession } from "@/lib/guard";

/**
 * Search and paging live in the URL, so a filtered catalog is a real link you
 * can bookmark or share. Empty and default values are dropped.
 */
function materialsHref(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `/materials?${s}` : "/materials";
}

const PER_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PER = 25;

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: { q?: string; per?: string; page?: string };
}) {
  const session = await requirePageSession("ADMIN");

  const [materials, pendingRequests] = await Promise.all([
    prisma.material.findMany({ orderBy: { name: "asc" } }),
    prisma.materialRequest.findMany({
      where: { status: "PENDING" },
      include: {
        worker: { select: { name: true } },
        material: { select: { name: true, unit: true } },
        task: { include: { client: { select: { name: true } } } },
      },
      orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const isLow = (m: (typeof materials)[number]) =>
    m.active && toNumber(m.quantityOnHand)! <= toNumber(m.reorderThreshold)!;
  // Reorder alerts describe the whole catalog, not the page you're looking
  // at — so they're computed before the search narrows anything.
  const lowStock = materials.filter(isLow);

  // Search and paging apply to the catalog list only. It's a small table
  // already in memory (isLow compares two columns, which the database can't
  // do in a plain where), so both are done here rather than in the query.
  const q = (searchParams.q ?? "").trim();
  const needle = q.toLowerCase();
  const found = q
    ? materials.filter(
        (m) =>
          m.name.toLowerCase().includes(needle) ||
          m.unit.toLowerCase().includes(needle)
      )
    : materials;

  const perParam = Number(searchParams.per);
  const per = (PER_OPTIONS as readonly number[]).includes(perParam)
    ? perParam
    : DEFAULT_PER;
  // Clamped, so narrowing the search while on page 4 lands you on the last
  // page that still exists instead of on an empty one.
  const totalPages = Math.max(1, Math.ceil(found.length / per));
  const page = Math.min(Math.max(1, Number(searchParams.page) || 1), totalPages);
  const start = (page - 1) * per;
  const pageRows = found.slice(start, start + per);

  // What every link carries forward. Page is deliberately absent: a new
  // search or page size starts you back at page 1.
  const baseParams = {
    q: q || undefined,
    per: per === DEFAULT_PER ? undefined : per,
  };

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Materials &"
        accent="inventory"
        subtitle="Stock on hand, pricing, and worker requests."
        action={
          <ModalButton
            label="Add material"
            title="Add a material"
            subtitle="New stock starts at zero — log a restock once it arrives."
          >
            <CatalogForm
              action={saveMaterial}
              submitLabel="Add material"
              layout="stacked"
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "unit", label: "Unit", placeholder: "gallon", required: true },
                { name: "costPrice", label: "Cost $", type: "number", step: "0.01", required: true },
                { name: "customerPrice", label: "Bills $", type: "number", step: "0.01", required: true },
                { name: "reorderThreshold", label: "Reorder at", type: "number", step: "0.01", required: true },
              ]}
            />
          </ModalButton>
        }
      />

      {pendingRequests.length > 0 && (
        <div className="mb-6 rounded-2xl border border-navy-500/25 bg-chrome-100/70 p-5">
          <p className="mb-3 font-bold text-navy-900">
            Material requests
            <span className="ml-2 font-semibold text-navy-700">
              ({pendingRequests.length})
            </span>
          </p>
          <div className="space-y-3">
            {pendingRequests.map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.urgent && (
                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-danger">
                      Urgent
                    </span>
                  )}
                  <span className="font-semibold text-ink">
                    {r.material ? `${r.material.name} (${r.material.unit})` : r.description}
                  </span>
                  <span className="text-muted">× {Number(r.quantityRequested)}</span>
                  <span className="text-faint">
                    — {r.worker.name}
                    {r.task ? ` · for ${r.task.client.name}` : " · general restock"}
                  </span>
                </div>
                <div className="mt-2">
                  <RespondForm requestId={r.id} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">
            Approving doesn&apos;t change stock — log a Restock below once the material
            physically arrives.
          </p>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="mb-6 rounded-2xl border border-warn/30 bg-warn/5 p-5">
          <p className="font-bold text-warn">
            Reorder alerts <span className="font-semibold">({lowStock.length})</span>
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
            {lowStock.map((m) => (
              <li key={m.id}>
                <span className="font-semibold text-ink">{m.name}</span> —{" "}
                {toNumber(m.quantityOnHand)} {m.unit} on hand (reorder at{" "}
                {toNumber(m.reorderThreshold)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A plain GET form, so search works before any JS loads. */}
      <form
        method="get"
        action="/materials"
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
            placeholder="Search materials by name or unit"
            aria-label="Search materials"
            className={`${inputClass} pl-9`}
          />
        </div>
        <button type="submit" className={btnBlue}>
          Search
        </button>
        {q && (
          <Link href={materialsHref({ per: baseParams.per })} className={btnGhost}>
            Clear
          </Link>
        )}
        <span className="text-sm text-muted">
          {q ? `${found.length} of ${materials.length}` : `${materials.length} total`}
        </span>
      </form>

      {/* Read-first: the catalog is scanned far more often than it's edited,
          so editing and stock changes live behind a dialog. */}
      <div className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card">
        <div className="hidden border-b border-line/70 bg-surface/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-faint sm:grid sm:grid-cols-[2fr_1.2fr_1fr_1fr_auto] sm:gap-4">
          <span>Material</span>
          <span>On hand</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Bills at</span>
          <span className="w-24" />
        </div>

        <div className="divide-y divide-line/60">
          {pageRows.length === 0 && (
            <p className="px-5 py-8 text-center text-muted">
              {materials.length === 0
                ? "No materials yet — add your first one above."
                : `No materials match “${q}”.`}
            </p>
          )}
          {pageRows.map((m) => {
            const low = isLow(m);
            const qty = toNumber(m.quantityOnHand) ?? 0;
            return (
              <div
                key={m.id}
                className="grid grid-cols-1 items-center gap-2 px-5 py-4 transition-colors hover:bg-chrome-100/40 sm:grid-cols-[2fr_1.2fr_1fr_1fr_auto] sm:gap-4"
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{m.name}</span>
                  {!m.active && (
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold text-muted">
                      Inactive
                    </span>
                  )}
                </span>

                <span>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums ${
                      low ? "bg-warn/10 text-warn" : "bg-good/10 text-good"
                    }`}
                  >
                    {qty} {m.unit}
                  </span>
                </span>

                <span className="tabular-nums text-muted sm:text-right">
                  {money(m.costPrice)}
                </span>
                <span className="font-medium tabular-nums text-ink sm:text-right">
                  {money(m.customerPrice)}
                </span>

                <span className="w-24 sm:text-right">
                  <ModalButton
                    label="Manage"
                    title={m.name}
                    subtitle={`${qty} ${m.unit} on hand · reorder at ${toNumber(m.reorderThreshold) ?? 0}`}
                    icon={null}
                    size="lg"
                    className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100"
                  >
                    <div className="space-y-6">
                      <div>
                        <p className="mb-3 text-sm font-bold text-navy-900">Adjust stock</p>
                        <StockForm materialId={m.id} />
                        <p className="mt-3 text-xs text-faint">
                          Every change is logged as a stock movement.
                        </p>
                      </div>

                      <div className="border-t border-line/70 pt-5">
                        <p className="mb-3 text-sm font-bold text-navy-900">Details & pricing</p>
                        <CatalogForm
                          action={saveMaterial}
                          id={m.id}
                          submitLabel="Save changes"
                          layout="stacked"
                          fields={[
                            { name: "name", label: "Name", defaultValue: m.name, required: true },
                            { name: "unit", label: "Unit", defaultValue: m.unit, required: true },
                            { name: "costPrice", label: "Cost $", type: "number", step: "0.01", defaultValue: toNumber(m.costPrice) ?? 0 },
                            { name: "customerPrice", label: "Bills $", type: "number", step: "0.01", defaultValue: toNumber(m.customerPrice) ?? 0 },
                            { name: "reorderThreshold", label: "Reorder at", type: "number", step: "0.01", defaultValue: toNumber(m.reorderThreshold) ?? 0 },
                          ]}
                        />
                      </div>

                      <div className="border-t border-line/70 pt-4">
                        <DeleteButton
                          action={toggleMaterial}
                          hidden={{ id: m.id }}
                          confirm={m.active ? `Deactivate ${m.name}?` : `Reactivate ${m.name}?`}
                          label={m.active ? "Deactivate this material" : "Reactivate this material"}
                          className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-faint transition hover:bg-danger/10 hover:text-danger"
                        />
                      </div>
                    </div>
                  </ModalButton>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pager. Both halves are links, so a page or size is a real URL you
          can bookmark or share. */}
      {found.length > 0 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Rows per page</span>
            <div className="flex gap-1 rounded-full border border-line bg-white p-1 shadow-sm">
              {PER_OPTIONS.map((n) => (
                <Link
                  key={n}
                  href={materialsHref({
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
              {start + 1}–{start + pageRows.length} of {found.length}
            </span>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link
                  href={materialsHref({ ...baseParams, page: page - 1 })}
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
                  href={materialsHref({ ...baseParams, page: page + 1 })}
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
      )}
    </AppShell>
  );
}
