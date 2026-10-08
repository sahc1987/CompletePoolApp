import { prisma } from "@/lib/prisma";
import { ensurePoolLocations } from "@/lib/geocode";
import { getBusinessTimezone } from "@/lib/schedule";
import { addZonedDays, parseZonedDate, zonedDayKey } from "@/lib/timezone";
import { assertRole, type Actor } from "@/server/actor";
import { requiredIso } from "@/server/serialize";
import { invalid, ok, type ServiceResult } from "@/server/result";
import type { TaskStatusValue } from "@/contracts/enums";

/**
 * The calendar's day map: one business day's jobs as stops, in visit order.
 *
 * Same visibility as the calendar itself — a worker gets only their own jobs,
 * and nobody gets money (a map has no use for it, and leaving it out means the
 * worker redaction can't be got wrong). Managers see every worker's day.
 *
 * Visit order is each worker's jobs by scheduled start time.
 */

export type RouteStop = {
  taskId: string;
  workerId: string;
  workerName: string;
  /** 1-based position in this worker's day. */
  order: number;
  clientName: string;
  serviceName: string;
  address: string;
  /** Absolute instant, for anything that needs it. */
  start: string;
  /** "9:30 AM" in the business's zone, so the browser does no zone math. */
  timeLabel: string;
  durationMin: number;
  status: TaskStatusValue;
  /** Null when the address couldn't be placed on the map. */
  lat: number | null;
  lng: number | null;
};

export type DayRoute = {
  /** `YYYY-MM-DD`, business-local. */
  day: string;
  /** e.g. "Thursday, Oct 8" */
  dayLabel: string;
  today: string;
  prevDay: string;
  nextDay: string;
  /** Workers with at least one stop, in order of their first stop. */
  workers: { id: string; name: string }[];
  stops: RouteStop[];
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getDayRoute(
  actor: Actor,
  day?: string
): Promise<ServiceResult<DayRoute>> {
  const denied = assertRole(actor, "OWNER", "ADMIN", "WORKER");
  if (denied) return denied;

  const timezone = await getBusinessTimezone();
  const today = zonedDayKey(new Date(), timezone);
  const key = day && DAY_RE.test(day) ? day : today;
  const start = parseZonedDate(key, timezone);
  if (!start) return invalid("Pick a valid day.");
  const end = addZonedDays(start, 1, timezone);

  const tasks = await prisma.task.findMany({
    where: {
      startTime: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      ...(actor.role === "WORKER" ? { workerId: actor.id } : {}),
    },
    include: {
      client: { select: { name: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
      pool: {
        select: { id: true, address: true, latitude: true, longitude: true, geocodedAt: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // Place any pool that has never been looked up, then read the fresh values.
  const unplaced = tasks.filter((t) => !t.pool.geocodedAt).map((t) => t.pool.id);
  const placed = new Map(
    tasks.map((t) => [t.pool.id, { lat: t.pool.latitude, lng: t.pool.longitude }])
  );
  if (unplaced.length > 0) {
    await ensurePoolLocations(unplaced);
    const fresh = await prisma.pool.findMany({
      where: { id: { in: unplaced } },
      select: { id: true, latitude: true, longitude: true },
    });
    for (const p of fresh) placed.set(p.id, { lat: p.latitude, lng: p.longitude });
  }

  const perWorker = new Map<string, number>();
  const workers: DayRoute["workers"] = [];
  const stops: RouteStop[] = tasks.map((t) => {
    const order = (perWorker.get(t.workerId) ?? 0) + 1;
    perWorker.set(t.workerId, order);
    if (order === 1) workers.push({ id: t.workerId, name: t.worker.name });
    const pos = placed.get(t.pool.id);
    return {
      taskId: t.id,
      workerId: t.workerId,
      workerName: t.worker.name,
      order,
      clientName: t.client.name,
      serviceName: t.service.name,
      address: t.pool.address,
      start: requiredIso(t.startTime),
      timeLabel: t.startTime.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      }),
      durationMin: t.durationMin,
      status: t.status as TaskStatusValue,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
    };
  });

  return ok({
    day: key,
    dayLabel: start.toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
    today,
    prevDay: zonedDayKey(addZonedDays(start, -1, timezone), timezone),
    nextDay: zonedDayKey(end, timezone),
    workers,
    stops,
  });
}
