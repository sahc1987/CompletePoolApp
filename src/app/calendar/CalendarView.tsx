"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventApi } from "@fullcalendar/core";
import type { Role, TaskStatus } from "@prisma/client";
import { useToast } from "@/components/Toast";
import { rescheduleTask } from "./actions";
import EditTaskModal from "./EditTaskModal";
import DaySummary from "./DaySummary";

// Flattened task shape the calendar renders, plus the raw fields the admin
// editor needs to prefill (workerId, serviceId, durationMin).
export type CalendarBill = {
  amount: number;
  paid: number;
  balance: number;
  status: "PENDING" | "PARTIAL" | "PAID";
  method: "CASH" | "CHECK" | "ONLINE" | null;
  paidAt: string | null;
};

export type CalendarTask = {
  id: string;
  title: string;
  clientName: string;
  address: string;
  price: number | null;
  workerId: string;
  workerName: string;
  serviceId: string;
  durationMin: number;
  start: string;
  end: string;
  status: TaskStatus;
  // Null until the job is finished (or for non-admins, who don't see money).
  bill: CalendarBill | null;
};

type Worker = { id: string; name: string };
type Service = { id: string; name: string; basePrice: number; defaultDurationMin: number };

/** "08:00" -> "8 AM", "13:30" -> "1:30 PM". */
function hourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Kept in step with StatusBadge: aqua = in progress, slate = submitted.
// Amber stays reserved for genuine problems.
const STATUS_COLOR: Record<TaskStatus, string> = {
  SCHEDULED: "#1a56db",
  IN_PROGRESS: "#0e7490",
  SUBMITTED: "#475569",
  APPROVED: "#166534",
  FLAGGED: "#b91c1c",
  CANCELLED: "#9ca3af",
};

export default function CalendarView({
  tasks,
  role,
  initialDate,
  slotMinTime,
  slotMaxTime,
  workStart,
  workEnd,
  workers,
  services,
}: {
  tasks: CalendarTask[];
  role: Role;
  initialDate: string;
  /** Grid bounds — the business hours plus an hour of padding each side. */
  slotMinTime: string;
  slotMaxTime: string;
  /** The configured business hours themselves, as "HH:MM". */
  workStart: string;
  workEnd: string;
  workers: Worker[];
  services: Service[];
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<"day" | "week">("week");
  // The day the summary below the grid describes. Follows the calendar's own
  // anchor date, so prev/next/today and the Day/Week toggle all move it.
  const [focusDate, setFocusDate] = useState(() => new Date(`${initialDate}T00:00:00`));
  // Track the open job by id (not the object) so the modal always renders the
  // freshest data after an action refreshes the page.
  const [editingId, setEditingId] = useState<string | null>(null);
  const isAdmin = role === "ADMIN";
  const editing = editingId ? tasks.find((t) => t.id === editingId) ?? null : null;

  const events = tasks.map((t) => ({
    id: t.id,
    // Client only — "Client — Service" was long enough to truncate in a week
    // column. The service moves to the event's bottom line.
    title: t.clientName,
    start: t.start,
    end: t.end,
    backgroundColor: STATUS_COLOR[t.status],
    borderColor: STATUS_COLOR[t.status],
    extendedProps: {
      address: t.address,
      price: t.price,
      workerName: t.workerName,
      serviceName: t.title,
      status: t.status,
    },
  }));

  // A 7-column week grid is unreadable on a phone — events truncate to a few
  // characters. Field crews open this on a phone and care about today, so
  // start on Day view at small widths (the toggle still works).
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      setView("day");
      calendarRef.current?.getApi().changeView("timeGridDay");
    }
  }, []);

  function switchView(next: "day" | "week") {
    setView(next);
    calendarRef.current
      ?.getApi()
      .changeView(next === "day" ? "timeGridDay" : "timeGridWeek");
  }

  function onEventClick(arg: EventClickArg) {
    if (!isAdmin) return;
    setEditingId(arg.event.id);
  }

  // Drag or resize -> persist the new start + duration, then refresh.
  // Typed to the minimal shape both eventDrop and eventResize provide.
  async function onEventChange(arg: { event: EventApi; revert: () => void }) {
    const { event } = arg;
    if (!event.start) return;
    const end = event.end ?? new Date(event.start.getTime() + 30 * 60_000);
    const durationMin = Math.round((end.getTime() - event.start.getTime()) / 60_000);
    const res = await rescheduleTask(event.id, event.start.toISOString(), durationMin);
    if (res?.error) {
      // Business-hours or double-booking rejection: put the event back where it
      // was and say why.
      arg.revert();
      toast(res.error, "error");
      return;
    }
    toast("Job rescheduled.");
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-tight text-ink">
            {role === "WORKER" ? "My schedule" : "Job "}
            {role !== "WORKER" && <span className="accent">calendar</span>}
          </h1>
          {isAdmin && (
            <p className="mt-0.5 text-sm text-muted">
              Click a job to edit its time, service, or worker · drag to
              reschedule · open{" "}
              <span className="font-medium text-ink">
                {hourLabel(workStart)}–{hourLabel(workEnd)}
              </span>{" "}
              (shaded hours are closed)
            </p>
          )}
        </div>

        <div className="flex overflow-hidden rounded-full border border-line bg-white p-0.5 shadow-sm">
          <button
            onClick={() => switchView("day")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              view === "day" ? "bg-navy-700 text-white" : "text-ink hover:bg-chrome-100"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => switchView("week")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              view === "week" ? "bg-navy-700 text-white" : "text-ink hover:bg-chrome-100"
            }`}
          >
            Week
          </button>
        </div>
      </div>

      <div className="calendar-shell rounded-2xl border border-line/80 bg-white p-3 shadow-card sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={initialDate}
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          height="auto"
          // Every job is timed, so the all-day strip was permanently empty.
          allDaySlot={false}
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          // Shades hours outside the configured workday, so the padding above
          // and below open hours reads as closed rather than bookable.
          businessHours={{
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startTime: workStart,
            endTime: workEnd,
          }}
          // Refuse the drag/resize outright instead of letting it land and
          // bouncing back from the server. The server still re-checks.
          eventConstraint="businessHours"
          // Keep the summary in step with whatever range the grid moves to.
          datesSet={() => {
            const api = calendarRef.current?.getApi();
            if (api) setFocusDate(api.getDate());
          }}
          events={events}
          editable={isAdmin}
          eventStartEditable={isAdmin}
          eventDurationEditable={isAdmin}
          eventClick={onEventClick}
          eventDrop={onEventChange}
          eventResize={onEventChange}
          eventContent={(arg) => {
            const { address, price, workerName, serviceName } = arg.event
              .extendedProps as {
              address: string;
              price: number | null;
              workerName: string;
              serviceName: string;
            };
            const start = arg.event.start;
            return (
              // Deliberate hierarchy: time and client read first, the address is
              // secondary, and worker/price sit quietest at the bottom. The old
              // version gave all four lines near-equal weight.
              <div className="flex h-full min-w-0 flex-col gap-[1px] overflow-hidden px-1.5 py-1 leading-tight">
                <div className="flex items-baseline gap-1.5">
                  {start && (
                    <span className="shrink-0 text-[10px] font-bold tabular-nums opacity-80">
                      {start.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  <span className="truncate text-[11.5px] font-semibold tracking-[-0.01em]">
                    {arg.event.title}
                  </span>
                </div>
                <span className="truncate text-[10.5px] opacity-85">{address}</span>
                <span className="mt-auto truncate text-[10px] font-medium opacity-75">
                  {serviceName}
                  {role !== "WORKER" && ` · ${workerName}`}
                  {role !== "WORKER" && price !== null && ` · $${price}`}
                </span>
              </div>
            );
          }}
        />
      </div>

      <DaySummary
        tasks={tasks}
        day={focusDate}
        role={role}
        onSelect={isAdmin ? setEditingId : undefined}
      />

      {editing && isAdmin && (
        <EditTaskModal
          task={editing}
          workers={workers}
          services={services}
          workStart={workStart}
          workEnd={workEnd}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}
