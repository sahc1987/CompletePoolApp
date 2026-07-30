import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Icon } from "@/components/icons";
import { card } from "@/components/styles";
import { money, toNumber } from "@/lib/serialize";
import { backfillBills, backfillLegacyPayments, paidAmount } from "@/lib/billing";
import PayForm from "./PayForm";
import PaymentsButton from "./PaymentsButton";
import UndoForm from "./UndoForm";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  ONLINE: "Online",
};

// "Pending" is not a warning — it's just not-yet. Amber here collided with
// the gold CTA sitting in the same row.
const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-pending/10 text-pending",
  PARTIAL: "bg-aqua/10 text-aqua",
  PAID: "bg-good/10 text-good",
};

function fmtDate(d: Date | null | undefined) {
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

// A clickable column header. Clicking the active column flips direction;
// clicking a new one starts at that column's natural direction. The current
// filter tab rides along so sorting never drops your view.
function SortHeader({
  label,
  col,
  sort,
  dir,
  filter,
  align = "left",
  thClass = "",
}: {
  label: string;
  col: SortCol;
  sort: SortCol | null;
  dir: "asc" | "desc";
  filter: string;
  align?: "left" | "right";
  /** Extra classes on the <th> — used to hide lower-priority columns on phones. */
  thClass?: string;
}) {
  const active = sort === col;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[col];
  const href = `/billing?status=${filter}&sort=${col}&dir=${nextDir}`;

  return (
    <th className={`px-3 py-3 font-semibold sm:px-5 ${align === "right" ? "text-right" : "text-left"} ${thClass}`}>
      <Link
        href={href}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={`group inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-navy-700 ${
          active ? "text-navy-700" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon
          name="chevron"
          size={13}
          className={`transition ${dir === "asc" && active ? "rotate-180" : ""} ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        />
      </Link>
    </th>
  );
}

// Columns the table can sort by. Text sorts ascend first, money descends
// first (you almost always want the biggest number at the top).
const SORT_COLS = ["job", "status", "total", "paid", "balance"] as const;
type SortCol = (typeof SORT_COLS)[number];
const DEFAULT_DIR: Record<SortCol, "asc" | "desc"> = {
  job: "asc",
  status: "asc",
  total: "desc",
  paid: "desc",
  balance: "desc",
};
// Most actionable first when ascending.
const STATUS_RANK: Record<string, number> = { PENDING: 0, PARTIAL: 1, PAID: 2 };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string; dir?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";

  // Make sure every finished job has a bill (covers jobs approved earlier),
  // and that bills paid before itemised payments existed have a payment row.
  await backfillBills();
  await backfillLegacyPayments();

  const bills = await prisma.bill.findMany({
    include: {
      payments: {
        orderBy: { paidAt: "asc" },
        include: { recordedBy: { select: { name: true } } },
      },
      reversals: {
        orderBy: { createdAt: "asc" },
        include: { reversedBy: { select: { name: true } } },
      },
      task: {
        include: {
          client: { select: { id: true, name: true } },
          service: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Derive money figures once; the balance drives everything below.
  const rows = bills.map((b) => {
    const amount = toNumber(b.amount) ?? 0;
    const paid = paidAmount(b.payments);
    return { bill: b, amount, paid, balance: Math.round((amount - paid) * 100) / 100 };
  });

  const filter =
    searchParams.status === "paid" ||
    searchParams.status === "pending" ||
    searchParams.status === "partial"
      ? searchParams.status
      : "all";
  const visible = rows.filter((r) =>
    filter === "all" ? true : r.bill.status.toLowerCase() === filter
  );

  // Sort. With no ?sort the query's own order stands (newest bill first).
  const sort = SORT_COLS.includes(searchParams.sort as SortCol)
    ? (searchParams.sort as SortCol)
    : null;
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  if (sort) {
    const sign = dir === "asc" ? 1 : -1;
    visible.sort((a, b) => {
      switch (sort) {
        case "job":
          return (
            sign *
            (a.bill.task.client.name.localeCompare(b.bill.task.client.name) ||
              a.bill.task.date.getTime() - b.bill.task.date.getTime())
          );
        case "status":
          return sign * (STATUS_RANK[a.bill.status] - STATUS_RANK[b.bill.status]);
        case "total":
          return sign * (a.amount - b.amount);
        case "paid":
          return sign * (a.paid - b.paid);
        case "balance":
          return sign * (a.balance - b.balance);
      }
    });
  }

  const totalBilled = rows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = rows.reduce((s, r) => s + r.paid, 0);
  const outstanding = Math.round((totalBilled - paidTotal) * 100) / 100;

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.bill.status === "PENDING").length,
    partial: rows.filter((r) => r.bill.status === "PARTIAL").length,
    paid: rows.filter((r) => r.bill.status === "PAID").length,
  };

  // Who still owes money, worst first.
  const byCustomer = new Map<string, { name: string; balance: number; jobs: number }>();
  for (const r of rows) {
    if (r.balance <= 0) continue;
    const c = r.bill.task.client;
    const entry = byCustomer.get(c.id) ?? { name: c.name, balance: 0, jobs: 0 };
    entry.balance = Math.round((entry.balance + r.balance) * 100) / 100;
    entry.jobs += 1;
    byCustomer.set(c.id, entry);
  }
  const debtors = [...byCustomer.values()].sort((a, b) => b.balance - a.balance);

  const tabs = [
    { key: "all", label: `All (${counts.all})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "partial", label: `Partial (${counts.partial})` },
    { key: "paid", label: `Paid (${counts.paid})` },
  ];

  // Serialize a bill's payment + reversal history once (Decimals/Dates can't
  // cross to the client). Shared by the mobile cards and the desktop table.
  const historyProps = (b: (typeof visible)[number]["bill"]) => ({
    payments: b.payments.map((p) => ({
      id: p.id,
      amount: toNumber(p.amount) ?? 0,
      method: p.method,
      checkNumber: p.checkNumber,
      billingAddress: p.billingAddress,
      note: p.note,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      recordedBy: p.recordedBy?.name ?? null,
    })),
    reversals: b.reversals.map((r) => ({
      id: r.id,
      reason: r.reason,
      amountReversed: toNumber(r.amountReversed) ?? 0,
      paymentCount: r.paymentCount,
      createdAt: r.createdAt.toISOString(),
      reversedBy: r.reversedBy?.name ?? null,
    })),
  });

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Billing &"
        accent="payments"
        subtitle={`Every finished job is billed here. ${
          isAdmin
            ? "Record cash, check, or online payments — full or partial."
            : "Read-only overview."
        }`}
      />

      {/* A compact 3-up KPI strip on phones (one shared card, hairline
          dividers) that expands into three roomy stat cards from sm up. */}
      <div className="mb-6 grid grid-cols-3 divide-x divide-line/70 overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card sm:gap-4 sm:divide-x-0 sm:border-0 sm:bg-transparent sm:shadow-none">
        {[
          { label: "Total billed", value: money(totalBilled), tone: "text-ink" },
          { label: "Collected", value: money(paidTotal), tone: "text-good" },
          { label: "Outstanding", value: money(outstanding), tone: "text-warn" },
        ].map((s) => (
          <div
            key={s.label}
            className="px-3 py-4 text-center sm:rounded-2xl sm:border sm:border-line/80 sm:bg-white sm:p-6 sm:text-left sm:shadow-card"
          >
            <div className="text-[11px] text-muted sm:text-sm">{s.label}</div>
            <div className={`mt-1 text-base font-bold tabular-nums sm:text-2xl ${s.tone}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Who still owes */}
      {debtors.length > 0 && (
        <div className={`${card} mb-6`}>
          <h2 className="mb-1 text-lg font-semibold text-ink">Customers with money owed</h2>
          <p className="mb-4 text-sm text-muted">
            Outstanding balance per customer, largest first.
          </p>
          <div className="flex flex-wrap gap-3">
            {debtors.map((d) => (
              <div
                key={d.name}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5"
              >
                <span className="font-semibold text-ink">{d.name}</span>
                <span className="font-bold text-warn">{money(d.balance)}</span>
                <span className="text-xs text-faint">
                  {d.jobs} job{d.jobs === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-line bg-white p-1 shadow-sm sm:w-fit">
        {tabs.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.key}
              href={`/billing?status=${t.key}${sort ? `&sort=${sort}&dir=${dir}` : ""}`}
              className={`rounded-full px-4 py-1.5 text-center text-sm font-semibold transition ${
                active ? "bg-navy-700 text-white" : "text-ink hover:bg-chrome-100"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className={card}>
          <p className="text-muted">
            {rows.length === 0
              ? "No bills yet — they're created automatically when a job is finished."
              : "Nothing in this view."}
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: one card per bill — the whole row is visible without any
            sideways scrolling, and the actions sit at the bottom. */}
        <div className="space-y-3 sm:hidden">
          {visible.map(({ bill: b, amount, paid, balance }) => {
            const last = b.payments[b.payments.length - 1];
            return (
              <div
                key={b.id}
                className="rounded-2xl border border-line/80 bg-white p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold leading-tight text-ink">
                      {b.task.client.name}
                    </div>
                    <div className="mt-0.5 text-[13px] leading-tight text-faint">
                      {b.task.service.name} · {fmtDate(b.task.date)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[b.status]}`}
                  >
                    {b.status[0] + b.status.slice(1).toLowerCase()}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface/70 p-3 text-center">
                  <div>
                    <div className="text-[11px] text-muted">Total</div>
                    <div className="mt-0.5 font-bold tabular-nums text-ink">{money(amount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Paid</div>
                    <div className={`mt-0.5 font-bold tabular-nums ${paid > 0 ? "text-good" : "text-faint"}`}>
                      {paid > 0 ? money(paid) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Balance</div>
                    <div className={`mt-0.5 font-bold tabular-nums ${balance > 0 ? "text-warn" : "text-faint"}`}>
                      {balance > 0 ? money(balance) : "—"}
                    </div>
                  </div>
                </div>

                {last && (
                  <div className="mt-2 text-[12px] text-faint">
                    Last: {METHOD_LABEL[last.method]}
                    {last.checkNumber ? ` #${last.checkNumber}` : ""} · {fmtDate(last.paidAt)}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(b.payments.length > 0 || b.reversals.length > 0) && (
                    <PaymentsButton
                      clientName={b.task.client.name}
                      total={amount}
                      paid={paid}
                      balance={balance}
                      {...historyProps(b)}
                    />
                  )}
                  {isAdmin && balance > 0 && (
                    <PayForm billId={b.id} clientName={b.task.client.name} balance={balance} />
                  )}
                  {isAdmin && paid > 0 && (
                    <UndoForm billId={b.id} clientName={b.task.client.name} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: the sortable table. */}
        <div className="hidden overflow-x-auto rounded-2xl border border-line/80 bg-white shadow-card sm:block">
          <table className="w-full border-collapse text-sm sm:min-w-[46rem]">
            <thead>
              <tr className="border-b border-line/70 bg-surface/60 text-[11px] uppercase tracking-wider text-faint">
                <SortHeader label="Job" col="job" sort={sort} dir={dir} filter={filter} />
                <SortHeader label="Status" col="status" sort={sort} dir={dir} filter={filter} />
                <SortHeader label="Total" col="total" sort={sort} dir={dir} filter={filter} align="right" thClass="hidden md:table-cell" />
                <SortHeader label="Paid" col="paid" sort={sort} dir={dir} filter={filter} align="right" />
                <SortHeader label="Balance" col="balance" sort={sort} dir={dir} filter={filter} align="right" />
                <th className="px-3 py-3 text-right font-semibold sm:px-5">
                  {isAdmin ? "" : "State"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {visible.map(({ bill: b, amount, paid, balance }) => {
                const pct = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;
                const last = b.payments[b.payments.length - 1];
                return (
                  <tr key={b.id} className="transition-colors hover:bg-chrome-100/40">
                    {/* Job: one idea, one cell — who + what + when */}
                    <td className="px-3 py-4 sm:px-5">
                      <div className="font-semibold leading-tight text-ink">
                        {b.task.client.name}
                      </div>
                      <div className="mt-0.5 text-[13px] leading-tight text-faint">
                        {b.task.service.name} · {fmtDate(b.task.date)}
                      </div>
                    </td>

                    {/* Status + how it was paid */}
                    <td className="px-3 py-4 sm:px-5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[b.status]}`}
                      >
                        {b.status[0] + b.status.slice(1).toLowerCase()}
                      </span>
                      {last && (
                        <div className="mt-1 text-[12px] leading-tight text-faint">
                          {METHOD_LABEL[last.method]}
                          {last.checkNumber ? ` #${last.checkNumber}` : ""} ·{" "}
                          {fmtDate(last.paidAt)}
                        </div>
                      )}
                      {(b.payments.length > 0 || b.reversals.length > 0) && (
                        <div className="mt-1">
                          <PaymentsButton
                            clientName={b.task.client.name}
                            total={amount}
                            paid={paid}
                            balance={balance}
                            {...historyProps(b)}
                          />
                        </div>
                      )}
                    </td>

                    {/* Money: right-aligned, tabular figures so columns line up.
                        Total & Paid drop away on phones (see the header). */}
                    <td className="hidden px-5 py-4 text-right font-semibold tabular-nums text-ink md:table-cell">
                      {money(amount)}
                    </td>

                    <td className="hidden px-5 py-4 text-right sm:table-cell">
                      <div
                        className={`tabular-nums ${paid > 0 ? "font-medium text-good" : "text-faint"}`}
                      >
                        {paid > 0 ? money(paid) : "—"}
                      </div>
                      {/* Progress makes a partial payment readable at a glance */}
                      {paid > 0 && balance > 0 && (
                        <div className="ml-auto mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-good"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </td>

                    <td
                      className={`px-3 py-4 text-right tabular-nums sm:px-5 ${
                        balance > 0 ? "font-bold text-warn" : "text-faint"
                      }`}
                    >
                      {balance > 0 ? money(balance) : "—"}
                    </td>

                    <td className="px-3 py-4 text-right sm:px-5">
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {balance > 0 && (
                            <PayForm
                              billId={b.id}
                              clientName={b.task.client.name}
                              balance={balance}
                            />
                          )}
                          {paid > 0 && (
                            <UndoForm billId={b.id} clientName={b.task.client.name} />
                          )}
                        </div>
                      ) : (
                        <span className="text-faint">
                          {b.status[0] + b.status.slice(1).toLowerCase()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </AppShell>
  );
}
