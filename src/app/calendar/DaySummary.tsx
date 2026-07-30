"use client";

import type { Role } from "@prisma/client";
import StatusBadge from "@/components/StatusBadge";
import type { CalendarTask } from "./CalendarView";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function hoursLabel(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Local YYYY-MM-DD, used to bucket jobs by calendar day. */
function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isToday(d: Date) {
  return dayKey(d) === dayKey(new Date());
}

// Every job in the calendar's visible range, listed under the grid and grouped
// by day. The grid shows *where* jobs sit; this answers "what is actually on".
// Covering the whole visible range matters: keying this off a single anchor date
// hid the rest of the week's work.
export default function DaySummary({
  tasks,
  from,
  to,
  role,
  onSelect,
}: {
  tasks: CalendarTask[];
  /** Inclusive start of the visible range. */
  from: Date;
  /** Exclusive end of the visible range. */
  to: Date;
  role: Role;
  onSelect?: (id: string) => void;
}) {
  const isWorker = role === "WORKER";

  const inRange = tasks
    .filter((t) => {
      const s = new Date(t.start).getTime();
      return s >= from.getTime() && s < to.getTime();
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  // One bucket per day that actually has work, in chronological order.
  const days = new Map<string, CalendarTask[]>();
  for (const t of inRange) {
    const key = dayKey(new Date(t.start));
    const list = days.get(key);
    if (list) list.push(t);
    else days.set(key, [t]);
  }

  const totalMin = inRange.reduce((s, t) => s + t.durationMin, 0);
  const value = inRange.reduce((s, t) => s + (t.price ?? 0), 0);
  const done = inRange.filter(
    (t) => t.status === "APPROVED" || t.status === "SUBMITTED"
  ).length;

  // A single day in Day view, a span in Week view.
  const lastDay = new Date(to.getTime() - 1);
  const multiDay = dayKey(from) !== dayKey(lastDay);
  const heading = multiDay
    ? `${from.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${lastDay.toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" }
      )}`
    : from.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

  return (
    <section className="mt-6 rounded-2xl border border-line/80 bg-white shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/70 px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-ink">
            {isWorker ? "My work" : "Work in view"}
          </h2>
          <p className="text-sm text-muted">{heading}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="text-muted">
            <span className="font-semibold text-ink">{inRange.length}</span>{" "}
            {inRange.length === 1 ? "job" : "jobs"}
          </span>
          {inRange.length > 0 && (
            <>
              <span className="text-muted">
                <span className="font-semibold text-ink">
                  {hoursLabel(totalMin)}
                </span>{" "}
                booked
              </span>
              <span className="text-muted">
                <span className="font-semibold text-ink">{done}</span> done
              </span>
              {!isWorker && (
                <span className="text-muted">
                  <span className="font-semibold text-ink">{usd(value)}</span>{" "}
                  scheduled
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {inRange.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-faint">
          Nothing scheduled in this range.
        </p>
      ) : (
        <div className="divide-y divide-line/60">
          {[...days.entries()].map(([key, dayTasks]) => {
            const d = new Date(`${key}T00:00:00`);
            const dayMin = dayTasks.reduce((s, t) => s + t.durationMin, 0);
            return (
              <div key={key}>
                {/* Day header only when the view spans more than one day. */}
                {multiDay && (
                  <div className="flex items-baseline justify-between gap-3 bg-surface/60 px-5 py-2">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        isToday(d) ? "text-navy-700" : "text-faint"
                      }`}
                    >
                      {d.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                      {isToday(d) && " · today"}
                    </span>
                    <span className="text-[11px] tabular-nums text-faint">
                      {dayTasks.length} {dayTasks.length === 1 ? "job" : "jobs"} ·{" "}
                      {hoursLabel(dayMin)}
                    </span>
                  </div>
                )}

                <ul className="divide-y divide-line/60">
                  {dayTasks.map((t) => {
                    const end = new Date(
                      new Date(t.start).getTime() + t.durationMin * 60_000
                    ).toISOString();
                    const row = (
                      <>
                        <span className="w-[9.5rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-ink">
                          {time(t.start)}
                          <span className="font-normal text-faint"> – {time(end)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {t.clientName} · {t.title}
                          </span>
                          <span className="block truncate text-xs text-faint">
                            {t.address}
                            {!isWorker && ` · ${t.workerName}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {!isWorker && t.price !== null && (
                            <span className="text-sm font-semibold tabular-nums text-ink">
                              {usd(t.price)}
                            </span>
                          )}
                          <StatusBadge status={t.status} />
                        </span>
                      </>
                    );

                    return (
                      <li key={t.id}>
                        {onSelect ? (
                          <button
                            type="button"
                            onClick={() => onSelect(t.id)}
                            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left transition hover:bg-chrome-100/50"
                          >
                            {row}
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                            {row}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
