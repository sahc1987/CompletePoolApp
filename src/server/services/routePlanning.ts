import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { checkWorkHours, getWorkHours } from "@/lib/schedule";
import { addZonedDays, parseZonedDate } from "@/lib/timezone";
import { routeLength, suggestOrder, type Point } from "@/lib/routeOrder";
import { assertRole, type Actor } from "@/server/actor";
import { badState, conflict, invalid, notFound, ok, type ServiceResult } from "@/server/result";
import { getDayRoute } from "@/server/services/routeReads";
import {
  routeOrderSchema,
  routeSuggestSchema,
  type RouteOrderInput,
  type RouteSuggestInput,
  type RouteSuggestion,
} from "@/contracts/routePlan";

/**
 * Re-ordering a worker's day swaps start times between their jobs that haven't
 * started yet: the day keeps the same time slots, only who goes in which slot
 * changes. Jobs already started, submitted or approved stay where they are.
 */

/** Propose a visit order. Nothing is saved. */
export async function suggestRoute(
  actor: Actor,
  input: RouteSuggestInput
): Promise<ServiceResult<RouteSuggestion>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;
  const parsed = routeSuggestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const day = await getDayRoute(actor, parsed.data.day);
  if (!day.ok) return day;

  const movable = day.data.stops.filter(
    (s) => s.workerId === parsed.data.workerId && s.status === "SCHEDULED"
  );
  if (movable.length < 3) {
    return badState("Needs at least three jobs that haven't started to suggest an order.");
  }
  const points: Point[] = [];
  for (const s of movable) {
    if (s.lat === null || s.lng === null) {
      return badState(`${s.address} couldn't be placed on the map, so a route can't be suggested.`);
    }
    points.push({ id: s.taskId, lat: s.lat, lng: s.lng });
  }

  const taskIds = suggestOrder(points);
  const byId = new Map(points.map((p) => [p.id, p]));
  const proposed = taskIds.map((id) => byId.get(id)!);
  const saved = routeLength(points) - routeLength(proposed);
  const changed = taskIds.some((id, i) => id !== points[i].id);
  return ok({ taskIds, changed, savedKm: Math.max(0, Math.round(saved * 10) / 10) });
}

/** Save a visit order by handing the day's time slots out in that order. */
export async function applyRouteOrder(
  actor: Actor,
  input: RouteOrderInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;
  const parsed = routeOrderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);
  const { day, workerId, taskIds } = parsed.data;

  const hours = await getWorkHours();
  const start = parseZonedDate(day, hours.timezone);
  if (!start) return invalid("Pick a valid day.");
  const end = addZonedDays(start, 1, hours.timezone);

  const tasks = await prisma.task.findMany({
    where: { workerId, startTime: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    select: { id: true, status: true, startTime: true, durationMin: true },
  });
  const movable = tasks.filter((t) => t.status === "SCHEDULED");
  const ids = new Set(taskIds);
  if (
    ids.size !== taskIds.length ||
    ids.size !== movable.length ||
    !movable.every((t) => ids.has(t.id))
  ) {
    return conflict("This day changed while you were looking at it. Reload and try again.");
  }
  if (movable.length === 0) return notFound("No jobs to reorder.");

  const slots = movable.map((t) => t.startTime).sort((a, b) => a.getTime() - b.getTime());
  const duration = new Map(movable.map((t) => [t.id, t.durationMin]));
  const placed = taskIds.map((id, i) => ({ id, startTime: slots[i], durationMin: duration.get(id)! }));

  // Jobs of different lengths can overrun the next slot, or the closing time.
  const all = [
    ...tasks.filter((t) => t.status !== "SCHEDULED").map((t) => ({ startTime: t.startTime, durationMin: t.durationMin })),
    ...placed,
  ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (let i = 0; i < all.length; i++) {
    const hoursError = checkWorkHours(all[i].startTime, all[i].durationMin, hours);
    if (hoursError) return invalid(hoursError);
    const next = all[i + 1];
    if (next && all[i].startTime.getTime() + all[i].durationMin * 60_000 > next.startTime.getTime()) {
      return conflict(
        "In that order a longer job would run into the next one. Move a start time on the calendar first."
      );
    }
  }

  await prisma.$transaction(
    placed.map((p) => prisma.task.update({ where: { id: p.id }, data: { startTime: p.startTime } }))
  );
  await notifyUser(workerId, "Your day's visit order was changed. Check today's list.", { link: "/worker" });
  return ok();
}
