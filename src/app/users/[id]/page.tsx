import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { card } from "@/components/styles";
import { toNumber } from "@/lib/serialize";
import { weeklyHours, weekLabel, hoursLabel } from "@/lib/payroll";
import EmploymentForm from "../EmploymentForm";

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/** Local "YYYY-MM-DD" for a date input, or "" when unset. */
function dateInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function longDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Whole years between then and now — nulls out for future dates. */
function yearsSince(d: Date): number | null {
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const before =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) y -= 1;
  return y < 0 ? null : y;
}

export default async function TeamMemberPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { tasksAssigned: true } },
      payRateHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
    },
  });
  if (!user) notFound();

  const rate = toNumber(user.hourlyRate);
  const weeks = await weeklyHours(user.id, { weeks: 8, hourlyRate: rate });

  const totalMinutes = weeks.reduce((s, w) => s + w.minutes, 0);
  const totalPay = weeks.reduce((s, w) => s + (w.pay ?? 0), 0);
  const tenure = user.hiredOn ? yearsSince(user.hiredOn) : null;

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted">
        <Link href="/users" className="hover:underline">
          Team
        </Link>
        <span>/</span>
        <span className="text-ink">{user.name}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{user.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {user.email} ·{" "}
            {user.role[0] + user.role.slice(1).toLowerCase()}
            {!user.active && " · disabled"}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted">
            Pay:{" "}
            <span className="font-semibold text-ink">
              {rate === null ? "not set" : `${usd(rate)}/hr`}
            </span>
          </span>
          <span className="text-muted">
            Hired:{" "}
            <span className="font-semibold text-ink">
              {user.hiredOn ? longDate(user.hiredOn) : "—"}
            </span>
            {tenure !== null && (
              <span className="text-faint">
                {" "}
                ({tenure} {tenure === 1 ? "yr" : "yrs"})
              </span>
            )}
          </span>
          <span className="text-muted">
            Birthday:{" "}
            <span className="font-semibold text-ink">
              {user.birthday
                ? user.birthday.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <section className={card}>
          <h2 className="mb-4 text-lg font-semibold text-ink">
            Employment details
          </h2>
          <EmploymentForm
            userId={user.id}
            hourlyRate={rate}
            hiredOn={dateInput(user.hiredOn)}
            birthday={dateInput(user.birthday)}
          />
        </section>

        {/* Hours worked by week */}
        <section className={card}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Hours by week</h2>
            <div className="flex flex-wrap gap-x-5 text-sm tabular-nums">
              <span className="text-muted">
                Last 8 weeks:{" "}
                <span className="font-semibold text-ink">
                  {hoursLabel(totalMinutes)}
                </span>
              </span>
              {rate !== null && (
                <span className="text-muted">
                  Est. pay:{" "}
                  <span className="font-semibold text-ink">{usd(totalPay)}</span>
                </span>
              )}
            </div>
          </div>
          <p className="mb-4 text-xs text-faint">
            Counts jobs the worker completed (submitted, approved, or flagged).
            Scheduled and in-progress work isn&apos;t included yet.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line/70 text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 text-left font-semibold">Week</th>
                  <th className="py-2 text-right font-semibold">Jobs</th>
                  <th className="py-2 text-right font-semibold">Hours</th>
                  <th className="py-2 text-right font-semibold">
                    {rate === null ? "" : "Pay"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {weeks.map((w) => (
                  <tr key={w.weekStart.toISOString()}>
                    <td className="py-2.5 text-ink">{weekLabel(w.weekStart)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">
                      {w.jobs || "—"}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-ink">
                      {w.minutes ? hoursLabel(w.minutes) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">
                      {w.pay === null ? "" : w.pay ? usd(w.pay) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pay rate audit trail */}
        <section className={card}>
          <h2 className="mb-1 text-lg font-semibold text-ink">Pay history</h2>
          <p className="mb-4 text-xs text-faint">
            Every change to hourly pay, with who made it. This log can&apos;t be
            edited or removed.
          </p>

          {user.payRateHistory.length === 0 ? (
            <p className="text-sm text-muted">
              No pay changes recorded yet. Setting an hourly rate above adds the
              first entry.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {user.payRateHistory.map((h) => {
                const from = toNumber(h.oldRate);
                const to = toNumber(h.newRate) ?? 0;
                const raise = from !== null && to > from;
                return (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {from === null ? (
                          <>Initial rate set to {usd(to)}/hr</>
                        ) : (
                          <>
                            {usd(from)} → {usd(to)}/hr{" "}
                            <span
                              className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                raise
                                  ? "bg-good/10 text-good"
                                  : "bg-pending/10 text-pending"
                              }`}
                            >
                              {raise ? "increase" : "decrease"}
                            </span>
                          </>
                        )}
                      </p>
                      {h.note && (
                        <p className="mt-0.5 text-xs text-muted">{h.note}</p>
                      )}
                    </div>
                    <p className="shrink-0 text-xs text-faint">
                      {longDate(h.createdAt)} · by {h.changedBy.name}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
