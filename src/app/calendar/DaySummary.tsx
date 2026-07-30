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

/** Same local calendar day? */
function sameDay(iso: string, day: Date) {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

// Everything happening on the focused day, listed under the calendar. The grid
// shows *where* jobs sit; this answers "what is actually on for this day".
export default function DaySummary({
  tasks,
  day,
  role,
  onSelect,
}: {
  tasks: CalendarTask[];
  day: Date;
  role: Role;
  onSelect?: (id: string) => void;
}) {
  const isWorker = role === "WORKER";
  const dayTasks = tasks
    .filter((t) => sameDay(t.start, day))
    .sort((a, b) => a.start.localeCompare(b.start));

  const totalMin = dayTasks.reduce((sum, t) => sum + t.durationMin, 0);
  const value = dayTasks.reduce((sum, t) => sum + (t.price ?? 0), 0);
  const done = dayTasks.filter(
    (t) => t.status === "APPROVED" || t.status === "SUBMITTED"
  ).length;

  const heading = day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="mt-6 rounded-2xl border border-line/80 bg-white shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/70 px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-ink">
            {isWorker ? "My day" : "Work on this day"}
          </h2>
          <p className="text-sm text-muted">{heading}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="text-muted">
            <span className="font-semibold text-ink">{dayTasks.length}</span>{" "}
            {dayTasks.length === 1 ? "job" : "jobs"}
          </span>
          {dayTasks.length > 0 && (
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

      {dayTasks.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-faint">
          Nothing scheduled on this day.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {dayTasks.map((t) => {
            const end = new Date(
              new Date(t.start).getTime() + t.durationMin * 60_000
            ).toISOString();
            const row = (
              <>
                <span className="w-32 shrink-0 text-sm font-semibold tabular-nums text-ink">
                  {time(t.start)}
                  <span className="font-normal text-faint">
                    {" "}
                    – {time(end)}
                  </span>
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
      )}
    </section>
  );
}
