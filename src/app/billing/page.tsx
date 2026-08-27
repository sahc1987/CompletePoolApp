import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Icon } from "@/components/icons";
import { btnBlue, btnGhost, card, inputClass, labelClass } from "@/components/styles";
import { money, toNumber } from "@/lib/serialize";
import {
  backfillBills,
  backfillLegacyPayments,
  paidAmount,
  invoiceNumber,
  receiptNumber,
} from "@/lib/billing";
import PayForm from "./PayForm";
import PaymentsButton from "./PaymentsButton";
import UndoForm from "./UndoForm";
import { InvoiceButton, type InvoiceData, type ReceiptData } from "./BillingPdf";
import { getCompanyInfo } from "@/lib/company";
import { requirePageSession } from "@/lib/guard";
import { getBusinessTimezone } from "@/lib/schedule";
import {
  addZonedDays,
  parseZonedDate,
  zonedDayKey,
  zonedDayStart,
  zonedMonthStart,
  zonedWeekStart,
} from "@/lib/timezone";

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

/**
 * Every control on this page is a link, so each one has to carry the whole
 * view along with it — change one thing, keep the rest. Undefined/empty and
 * default values are dropped so the common URL stays short.
 */
function billingHref(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `/billing?${s}` : "/billing";
}

function fmtDate(d: Date | null | undefined) {
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

// A clickable column header. Clicking the active column flips direction;
// clicking a new one starts at that column's natural direction. The current
// tab and date range ride along so sorting never drops your view — but the
// page resets, since row 1 of a re-sorted list is a different row.
function SortHeader({
  label,
  col,
  sort,
  dir,
  base,
  align = "left",
  thClass = "",
}: {
  label: string;
  col: SortCol;
  sort: SortCol | null;
  dir: "asc" | "desc";
  base: Record<string, string | number | undefined>;
  align?: "left" | "right";
  /** Extra classes on the <th> — used to hide lower-priority columns on phones. */
  thClass?: string;
}) {
  const active = sort === col;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[col];
  const href = billingHref({ ...base, sort: col, dir: nextDir });

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

// Date scopes, keyed off the job date shown on every row.
const RANGES = ["all", "day", "week", "month", "custom"] as const;
type RangeKey = (typeof RANGES)[number];
const RANGE_LABEL: Record<RangeKey, string> = {
  all: "All time",
  day: "Specific date",
  week: "This week",
  month: "This month",
  custom: "Custom",
};

const PER_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PER = 10;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    sort?: string;
    dir?: string;
    range?: string;
    from?: string;
    to?: string;
    per?: string;
    page?: string;
  };
}) {
  const session = await requirePageSession("ADMIN", "OWNER");

  const isAdmin = session.user.role === "ADMIN";

  // Make sure every finished job has a bill (covers jobs approved earlier),
  // and that bills paid before itemised payments existed have a payment row.
  await backfillBills();
  await backfillLegacyPayments();

  // Printed on every invoice and receipt; configured under Settings.
  const company = await getCompanyInfo();

  // Job dates are stored at business-local midnight (see assign/actions), so
  // the range boundaries have to be built in that same configured zone — the
  // env default would slide every boundary by the offset between them.
  const tz = await getBusinessTimezone();

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
          client: {
            select: { id: true, name: true, address: true, phone: true, email: true },
          },
          service: { select: { name: true } },
          // Invoice line items: the service plus each add-on at its sold price.
          pool: { select: { address: true } },
          extras: { include: { extraService: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Derive money figures once; the balance drives everything below.
  const rows = bills.map((b) => {
    const amount = toNumber(b.amount) ?? 0;
    const paid = paidAmount(b.payments);
    const balance = Math.round((amount - paid) * 100) / 100;

    // The job's own price, with each add-on itemised beneath it.
    const extras = b.task.extras.map((e) => ({
      description: e.extraService.name,
      amount: toNumber(e.priceAtTimeOfSale) ?? 0,
    }));
    const base =
      Math.round((amount - extras.reduce((s, e) => s + e.amount, 0)) * 100) / 100;

    const invoice: InvoiceData = {
      invoiceNo: invoiceNumber(b.invoiceNo),
      issuedAt: fmtDate(b.createdAt),
      clientName: b.task.client.name,
      // The bill goes to the client's billing address; the pool is where the
      // work happened. They're often the same, and the document only prints
      // the service location separately when it actually differs.
      address: b.task.client.address ?? b.task.pool.address,
      serviceAddress: b.task.pool.address,
      clientPhone: b.task.client.phone,
      clientEmail: b.task.client.email,
      jobDate: fmtDate(b.task.date),
      serviceName: b.task.service.name,
      lineItems: [{ description: b.task.service.name, amount: base }, ...extras],
      total: amount,
      paid,
      balance,
      status: b.status,
      company,
    };

    // Receipts show the balance *after* their own payment, so walk the
    // payments in order and carry a running total.
    let running = 0;
    const receipts: ReceiptData[] = b.payments.map((p) => {
      const amt = toNumber(p.amount) ?? 0;
      running = Math.round((running + amt) * 100) / 100;
      return {
        receiptNo: receiptNumber(p.receiptNo),
        invoiceNo: invoiceNumber(b.invoiceNo),
        paidAt: fmtDate(p.paidAt),
        clientName: b.task.client.name,
        address: b.task.client.address ?? b.task.pool.address,
        serviceAddress: b.task.pool.address,
        clientPhone: b.task.client.phone,
        clientEmail: b.task.client.email,
        serviceName: b.task.service.name,
        jobDate: fmtDate(b.task.date),
        amount: amt,
        method: METHOD_LABEL[p.method] ?? p.method,
        checkNumber: p.checkNumber,
        balanceAfter: Math.round((amount - running) * 100) / 100,
        invoiceTotal: amount,
        recordedBy: p.recordedBy?.name ?? null,
        note: p.note,
        company,
      };
    });

    return { bill: b, amount, paid, balance, invoice, receipts };
  });

  // Date range first — it's the outer scope, so the KPI strip, the tab
  // counts and the debtor list all describe the period you're looking at
  // rather than the whole history.
  const rangeKey: RangeKey = (RANGES as readonly string[]).includes(
    searchParams.range ?? ""
  )
    ? (searchParams.range as RangeKey)
    : "all";
  const fromParam = (searchParams.from ?? "").trim();
  const toParam = (searchParams.to ?? "").trim();

  const now = new Date();
  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null; // exclusive
  if (rangeKey === "day") {
    // A single day, reusing ?from as the chosen date so the URL keeps the
    // same shape as a custom range. Nothing picked yet means today.
    rangeStart =
      (fromParam ? parseZonedDate(fromParam, tz) : null) ?? zonedDayStart(now, tz);
    rangeEnd = addZonedDays(rangeStart, 1, tz);
  } else if (rangeKey === "week") {
    rangeStart = zonedWeekStart(now, tz);
    rangeEnd = addZonedDays(rangeStart, 7, tz);
  } else if (rangeKey === "month") {
    rangeStart = zonedMonthStart(now, tz);
    // +32 days always lands in the next month, whatever its length.
    rangeEnd = zonedMonthStart(addZonedDays(rangeStart, 32, tz), tz);
  } else if (rangeKey === "custom") {
    rangeStart = fromParam ? parseZonedDate(fromParam, tz) : null;
    const toDate = toParam ? parseZonedDate(toParam, tz) : null;
    // "To" is the last day you want included, not the cut-off before it.
    rangeEnd = toDate ? addZonedDays(toDate, 1, tz) : null;
  }
  // A reversed custom range (from after to) would silently match nothing;
  // read it the way it was obviously meant instead.
  if (rangeStart && rangeEnd && rangeStart >= rangeEnd) {
    [rangeStart, rangeEnd] = [
      addZonedDays(rangeEnd, -1, tz),
      addZonedDays(rangeStart, 1, tz),
    ];
  }
  const ranged = rangeStart !== null || rangeEnd !== null;

  // The day the "Specific date" picker is sitting on, plus the days on either side —
  // written as yyyy-mm-dd in the business zone, which is what <input
  // type="date"> and parseZonedDate both speak.
  const todayValue = zonedDayKey(now, tz);
  const dayValue =
    rangeKey === "day" && rangeStart ? zonedDayKey(rangeStart, tz) : todayValue;
  const prevDay =
    rangeKey === "day" && rangeStart
      ? zonedDayKey(addZonedDays(rangeStart, -1, tz), tz)
      : todayValue;
  const nextDay =
    rangeKey === "day" && rangeStart
      ? zonedDayKey(addZonedDays(rangeStart, 1, tz), tz)
      : todayValue;

  const inPeriod = (d: Date | null | undefined) => {
    if (!d) return false;
    if (rangeStart && d < rangeStart) return false;
    if (rangeEnd && d >= rangeEnd) return false;
    return true;
  };

  // A bill belongs to the period if the job was done in it *or* money came in
  // during it — so last month's job paid this month still shows up in the
  // month you actually collected it.
  const inRange = ranged
    ? rows.filter(
        (r) =>
          inPeriod(r.bill.task.date) || r.bill.payments.some((p) => inPeriod(p.paidAt))
      )
    : rows;

  // Re-cut each row's money to the period. "Paid" becomes what came in during
  // it and the history behind the row lists only those payments; the balance
  // stays the real one, because that's what you'd collect today and it's what
  // the payment form is allowed to take.
  const scoped = inRange.map((r) => {
    const keep = r.bill.payments.map((p) => !ranged || inPeriod(p.paidAt));
    const periodPayments = r.bill.payments.filter((_, i) => keep[i]);
    const periodReceipts = r.receipts.filter((_, i) => keep[i]);
    // Original 1-based position, so a trimmed list still reads "Payment 3".
    const periodSeqs = r.bill.payments.map((_, i) => i + 1).filter((_, i) => keep[i]);
    const periodReversals = ranged
      ? r.bill.reversals.filter((x) => inPeriod(x.createdAt))
      : r.bill.reversals;
    return {
      ...r,
      /** Everything ever paid on this bill. */
      paidAll: r.paid,
      /** Paid inside the selected period — what the row and KPIs show. */
      paid: paidAmount(periodPayments),
      periodPayments,
      periodReceipts,
      periodSeqs,
      periodReversals,
      // Only a job dated inside the period counts as billed in it.
      billedInPeriod: !ranged || inPeriod(r.bill.task.date),
    };
  });

  const periodLabel = !ranged
    ? null
    : rangeKey === "day" && rangeStart
    ? `on ${fmtDate(rangeStart)}`
    : `${rangeStart ? fmtDate(rangeStart) : "the beginning"} – ${
        rangeEnd ? fmtDate(addZonedDays(rangeEnd, -1, tz)) : "today"
      }`;

  const filter =
    searchParams.status === "paid" ||
    searchParams.status === "pending" ||
    searchParams.status === "partial"
      ? searchParams.status
      : "all";
  const visible = scoped.filter((r) =>
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

  // Three independent period figures: what was billed in it, what was
  // collected in it, and what these bills still owe. They no longer subtract
  // into each other, because a payment in the period can belong to a job
  // billed outside it.
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalBilled = round(
    scoped.reduce((s, r) => s + (r.billedInPeriod ? r.amount : 0), 0)
  );
  const paidTotal = round(scoped.reduce((s, r) => s + r.paid, 0));
  const outstanding = round(
    scoped.reduce((s, r) => s + Math.max(0, r.balance), 0)
  );

  const counts = {
    all: scoped.length,
    pending: scoped.filter((r) => r.bill.status === "PENDING").length,
    partial: scoped.filter((r) => r.bill.status === "PARTIAL").length,
    paid: scoped.filter((r) => r.bill.status === "PAID").length,
  };

  // Who still owes money, worst first.
  const byCustomer = new Map<string, { name: string; balance: number; jobs: number }>();
  for (const r of scoped) {
    if (r.balance <= 0) continue;
    const c = r.bill.task.client;
    const entry = byCustomer.get(c.id) ?? { name: c.name, balance: 0, jobs: 0 };
    entry.balance = Math.round((entry.balance + r.balance) * 100) / 100;
    entry.jobs += 1;
    byCustomer.set(c.id, entry);
  }
  const debtors = [...byCustomer.values()].sort((a, b) => b.balance - a.balance);

  // Pagination. The page is clamped, so narrowing a filter while sitting on
  // page 6 lands you on the last page that still exists instead of on an
  // empty one.
  const perParam = Number(searchParams.per);
  const per = (PER_OPTIONS as readonly number[]).includes(perParam)
    ? perParam
    : DEFAULT_PER;
  const totalPages = Math.max(1, Math.ceil(visible.length / per));
  const page = Math.min(Math.max(1, Number(searchParams.page) || 1), totalPages);
  const start = (page - 1) * per;
  const pageRows = visible.slice(start, start + per);

  // What every link on this page carries forward. Page is deliberately absent:
  // changing tab, sort or range starts you back at page 1.
  const baseParams = {
    status: filter === "all" ? undefined : filter,
    range: rangeKey === "all" ? undefined : rangeKey,
    from:
      rangeKey === "custom" || rangeKey === "day" ? fromParam || undefined : undefined,
    to: rangeKey === "custom" ? toParam || undefined : undefined,
    sort: sort ?? undefined,
    dir: sort ? dir : undefined,
    per: per === DEFAULT_PER ? undefined : per,
  };
  // The sort headers set their own sort/dir.
  const { sort: _s, dir: _d, ...sortBase } = baseParams;

  const tabs = [
    { key: "all", label: `All (${counts.all})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "partial", label: `Partial (${counts.partial})` },
    { key: "paid", label: `Paid (${counts.paid})` },
  ];

  // Serialize a bill's payment + reversal history once (Decimals/Dates can't
  // cross to the client). Shared by the mobile cards and the desktop table.
  const historyProps = (r: (typeof visible)[number]) => ({
    rangeLabel: periodLabel ? `Payments from ${periodLabel}.` : undefined,
    payments: r.periodPayments.map((p, i) => ({
      seq: r.periodSeqs[i],
      id: p.id,
      amount: toNumber(p.amount) ?? 0,
      method: p.method,
      checkNumber: p.checkNumber,
      billingAddress: p.billingAddress,
      note: p.note,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      recordedBy: p.recordedBy?.name ?? null,
    })),
    reversals: r.periodReversals.map((x) => ({
      id: x.id,
      reason: x.reason,
      amountReversed: toNumber(x.amountReversed) ?? 0,
      paymentCount: x.paymentCount,
      createdAt: x.createdAt.toISOString(),
      reversedBy: x.reversedBy?.name ?? null,
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

      {/* Date scope. It sits above the totals because it governs them —
          everything below describes the period selected here. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-full border border-line bg-white p-1 shadow-sm sm:w-fit">
          {RANGES.map((key) => {
            const active = rangeKey === key;
            return (
              <Link
                key={key}
                href={billingHref({ ...baseParams, range: key === "all" ? undefined : key })}
                className={`rounded-full px-4 py-1.5 text-center text-sm font-semibold transition ${
                  active ? "bg-navy-700 text-white" : "text-ink hover:bg-chrome-100"
                }`}
              >
                {RANGE_LABEL[key]}
              </Link>
            );
          })}
        </div>
        {periodLabel && (
          <p className="text-sm text-muted">
            Jobs done or payments received {periodLabel}
          </p>
        )}
      </div>

      {/* One exact day. Same plain GET form as the custom range, with a
          single input and arrows to walk a day at a time. */}
      {rangeKey === "day" && (
        <form
          method="get"
          action="/billing"
          className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line/80 bg-white p-4 shadow-card"
        >
          <input type="hidden" name="range" value="day" />
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          {sort && (
            <>
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />
            </>
          )}
          <input type="hidden" name="per" value={per} />
          <div>
            <label htmlFor="day" className={labelClass}>
              Date
            </label>
            <input
              id="day"
              type="date"
              name="from"
              defaultValue={dayValue}
              className={`${inputClass} sm:w-48`}
            />
          </div>
          <button type="submit" className={btnBlue}>
            Apply
          </button>
          <div className="flex items-center gap-1">
            <Link
              href={billingHref({ ...baseParams, from: prevDay })}
              aria-label="Previous day"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm transition hover:bg-chrome-100"
            >
              <Icon name="chevron" size={14} className="rotate-90" />
            </Link>
            <Link
              href={billingHref({ ...baseParams, from: nextDay })}
              aria-label="Next day"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm transition hover:bg-chrome-100"
            >
              <Icon name="chevron" size={14} className="-rotate-90" />
            </Link>
          </div>
          {dayValue !== todayValue && (
            <Link
              href={billingHref({ ...baseParams, from: undefined })}
              className={btnGhost}
            >
              Today
            </Link>
          )}
        </form>
      )}

      {/* Custom range. A plain GET form, so it works before any JS loads. */}
      {rangeKey === "custom" && (
        <form
          method="get"
          action="/billing"
          className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line/80 bg-white p-4 shadow-card"
        >
          <input type="hidden" name="range" value="custom" />
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          {sort && (
            <>
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />
            </>
          )}
          <input type="hidden" name="per" value={per} />
          <div>
            <label htmlFor="from" className={labelClass}>
              From
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={fromParam}
              className={`${inputClass} sm:w-48`}
            />
          </div>
          <div>
            <label htmlFor="to" className={labelClass}>
              To
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={toParam}
              className={`${inputClass} sm:w-48`}
            />
          </div>
          <button type="submit" className={btnBlue}>
            Apply
          </button>
          {(fromParam || toParam) && (
            <Link href={billingHref({ ...baseParams, range: "custom", from: undefined, to: undefined })} className={btnGhost}>
              Clear
            </Link>
          )}
        </form>
      )}

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

      {periodLabel && (
        <p className="-mt-4 mb-6 text-[13px] text-muted">
          Billed counts jobs dated in this period, collected counts payments
          received in it, and outstanding is the full balance still owed on
          these bills.
        </p>
      )}

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
              href={billingHref({ ...baseParams, status: t.key === "all" ? undefined : t.key })}
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
              : rangeKey === "all"
                ? "Nothing in this view."
                : rangeKey === "day"
                  ? "No bills or payments on this date."
                  : "No bills or payments in this range."}
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: one card per bill — the whole row is visible without any
            sideways scrolling, and the actions sit at the bottom. */}
        <div className="space-y-3 sm:hidden">
          {pageRows.map((row) => {
            const { bill: b, amount, paid, paidAll, balance, invoice } = row;
            const last = row.periodPayments[row.periodPayments.length - 1];
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
                    {paidAll !== paid && (
                      <div className="text-[10px] tabular-nums text-faint">
                        {money(paidAll)} all time
                      </div>
                    )}
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
                  <InvoiceButton data={invoice} />
                  {(row.periodPayments.length > 0 || row.periodReversals.length > 0) && (
                    <PaymentsButton
                      clientName={b.task.client.name}
                      total={amount}
                      paid={paidAll}
                      balance={balance}
                      receipts={row.periodReceipts}
                      {...historyProps(row)}
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
                <SortHeader label="Job" col="job" sort={sort} dir={dir} base={sortBase} />
                <SortHeader label="Status" col="status" sort={sort} dir={dir} base={sortBase} />
                <SortHeader label="Total" col="total" sort={sort} dir={dir} base={sortBase} align="right" thClass="hidden md:table-cell" />
                <SortHeader label="Paid" col="paid" sort={sort} dir={dir} base={sortBase} align="right" />
                <SortHeader label="Balance" col="balance" sort={sort} dir={dir} base={sortBase} align="right" />
                <th className="px-3 py-3 text-right font-semibold sm:px-5">
                  {isAdmin ? "" : "State"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {pageRows.map((row) => {
                const { bill: b, amount, paid, paidAll, balance, invoice } = row;
                // Progress is against everything ever paid — the real state of
                // the bill, not the slice the filter is showing.
                const pct =
                  amount > 0 ? Math.min(100, Math.round((paidAll / amount) * 100)) : 0;
                const last = row.periodPayments[row.periodPayments.length - 1];
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
                      {(row.periodPayments.length > 0 ||
                        row.periodReversals.length > 0) && (
                        <div className="mt-1">
                          <PaymentsButton
                            clientName={b.task.client.name}
                            total={amount}
                            paid={paidAll}
                            balance={balance}
                            receipts={row.periodReceipts}
                            {...historyProps(row)}
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
                      {paidAll !== paid && (
                        <div className="text-[11px] tabular-nums text-faint">
                          {money(paidAll)} all time
                        </div>
                      )}
                      {/* Progress makes a partial payment readable at a glance */}
                      {paidAll > 0 && balance > 0 && (
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
                          <InvoiceButton data={invoice} />
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
                        // Owner is read-only here, but the invoice is a
                        // document, not a mutation.
                        <div className="flex items-center justify-end gap-1.5">
                          <InvoiceButton data={invoice} />
                          <span className="text-faint">
                            {b.status[0] + b.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
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
                  href={billingHref({
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
              {start + 1}–{start + pageRows.length} of {visible.length}
            </span>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link
                  href={billingHref({ ...baseParams, page: page - 1 })}
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
                  href={billingHref({ ...baseParams, page: page + 1 })}
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
