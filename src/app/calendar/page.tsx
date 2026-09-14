import { listCalendarTasks } from "@/server/services/taskReads";
import {
  listAssignableWorkers,
  listServices,
} from "@/server/services/catalogReads";
import { listUsableMaterials } from "@/server/services/materialReads";
import AppShell from "@/components/AppShell";
import { getWorkHours, minToHHMM } from "@/lib/schedule";
import { zonedDayKey } from "@/lib/timezone";
import CalendarView, { type CalendarTask } from "./CalendarView";
import { requirePageSession } from "@/lib/guard";

export default async function CalendarPage() {
  const session = await requirePageSession();

  const isWorker = session.user.role === "WORKER";
  const isAdmin = session.user.role === "ADMIN";

  // Worker sees only their own tasks; admin/owner see everything. Price and
  // billing are stripped for a worker inside the service, so no caller has to
  // remember to withhold them.
  const tasksResult = await listCalendarTasks(session.user);
  if (!tasksResult.ok) throw new Error(tasksResult.error);
  const calendarTasks: CalendarTask[] = tasksResult.data;

  // Only admins can edit; fetch the option lists they need for the editor.
  const [workers, services, materials] = isAdmin
    ? await Promise.all([
        listAssignableWorkers(),
        listServices(),
        listUsableMaterials(session.user).then((r) => (r.ok ? r.data : [])),
      ])
    : [[], [], []];

  // Build the date from local parts. toISOString() is UTC, which lands the
  // calendar on tomorrow every evening once local time crosses UTC midnight
  // (e.g. 8pm EDT = 00:00 UTC) — and disagreed with "Today" on /worker.
  // Calendar slots follow the configured workday, so the grid matches the hours
  // jobs are actually allowed in. One slot of padding on each side keeps a job
  // at the very edge from being clipped.
  const hours = await getWorkHours();

  // "Today" in the crews' zone, not the server's.
  const initialDate = zonedDayKey(new Date(), hours.timezone);
  const slotMinTime = `${minToHHMM(Math.max(0, hours.startMin - 60))}:00`;
  const slotMaxTime = `${minToHHMM(Math.min(24 * 60, hours.endMin + 60))}:00`;

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <CalendarView
        tasks={calendarTasks}
        role={session.user.role}
        initialDate={initialDate}
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        workStart={minToHHMM(hours.startMin)}
        workEnd={minToHHMM(hours.endMin)}
        timezone={hours.timezone}
        workers={workers}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          basePrice: s.basePrice,
          defaultDurationMin: s.defaultDurationMin,
        }))}
        materials={materials}
      />
    </AppShell>
  );
}
