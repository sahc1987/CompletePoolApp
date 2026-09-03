import { prisma } from "./prisma";
import { getBusinessTimezone } from "./schedule";
import { zonedDayStart, addZonedDays } from "./timezone";

// Jobs still on the books. Approved/cancelled work drops off, matching the
// worker's own task list.
const ACTIVE = ["SCHEDULED", "IN_PROGRESS", "SUBMITTED", "FLAGGED"] as const;
// Not yet dealt with — what's actually left to do today.
const OUTSTANDING = ["SCHEDULED", "IN_PROGRESS"] as const;

export type NotificationViewer = { id: string; role: string };

// Workers see only their own load; managers see the whole team's day.
function scopeFor(viewer: NotificationViewer) {
  const isManager = viewer.role === "ADMIN" || viewer.role === "OWNER";
  return { isManager, where: isManager ? {} : { workerId: viewer.id } };
}

/**
 * The bell's whole payload: the user's latest notifications, their unread
 * count, and a summary of the work assigned to them (or to the team, for a
 * manager). Shared by the polled GET and the SSE stream so both describe the
 * same thing.
 */
export async function buildNotificationPayload(viewer: NotificationViewer) {
  const { isManager, where: scopeWhere } = scopeFor(viewer);
  const userId = viewer.id;

  // "Today" is the crews' today, not the server's — on a UTC host the day
  // would otherwise roll over mid-evening local time.
  const tz = await getBusinessTimezone();
  const now = new Date();
  const dayStart = zonedDayStart(now, tz);
  const dayEnd = addZonedDays(dayStart, 1, tz);

  const [items, unread, todayTotal, todayLeft, assignedTotal, next] =
    await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: { userId, read: false } }),
      // Everything scheduled for today, however it ended up.
      prisma.task.count({
        where: { ...scopeWhere, startTime: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.task.count({
        where: {
          ...scopeWhere,
          status: { in: [...OUTSTANDING] },
          startTime: { gte: dayStart, lt: dayEnd },
        },
      }),
      // All open work assigned, not just today's.
      prisma.task.count({
        where: { ...scopeWhere, status: { in: [...ACTIVE] } },
      }),
      // The next job still to come.
      prisma.task.findFirst({
        where: {
          ...scopeWhere,
          status: { in: [...OUTSTANDING] },
          startTime: { gte: now },
        },
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          startTime: true,
          client: { select: { name: true } },
          pool: { select: { address: true } },
          service: { select: { name: true } },
          worker: { select: { name: true } },
        },
      }),
    ]);

  return {
    items,
    unread,
    summary: {
      scope: isManager ? ("team" as const) : ("mine" as const),
      todayTotal,
      todayLeft,
      assignedTotal,
      next: next && {
        id: next.id,
        startTime: next.startTime,
        clientName: next.client.name,
        address: next.pool.address,
        serviceName: next.service.name,
        // Only meaningful to managers, who see other people's jobs.
        workerName: isManager ? next.worker.name : null,
      },
    },
  };
}

/**
 * A cheap fingerprint of everything the payload is derived from, so the stream
 * can decide whether anything actually changed without re-running the six
 * queries above every tick. Two indexed aggregates instead.
 *
 * Row counts are part of it because a deletion moves no timestamp forward.
 */
export async function notificationSignature(
  viewer: NotificationViewer
): Promise<string> {
  const { where: scopeWhere } = scopeFor(viewer);

  const [notifs, tasks] = await Promise.all([
    prisma.notification.aggregate({
      where: { userId: viewer.id },
      _max: { createdAt: true },
      _count: { _all: true },
    }),
    prisma.task.aggregate({
      where: scopeWhere,
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
  ]);

  // Unread state changes without creating a row, so count it too.
  const unread = await prisma.notification.count({
    where: { userId: viewer.id, read: false },
  });

  return [
    notifs._count._all,
    notifs._max.createdAt?.getTime() ?? 0,
    unread,
    tasks._count._all,
    tasks._max.updatedAt?.getTime() ?? 0,
  ].join(":");
}
