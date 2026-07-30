import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Jobs still on the books. Approved/cancelled work drops off, matching the
// worker's own task list.
const ACTIVE = ["SCHEDULED", "IN_PROGRESS", "SUBMITTED", "FLAGGED"] as const;
// Not yet dealt with — what's actually left to do today.
const OUTSTANDING = ["SCHEDULED", "IN_PROGRESS"] as const;

// Current user's latest notifications + unread count, plus a live summary of
// their assigned work. Polled by the bell.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: userId, role } = session.user;
  // Workers see only their own load; managers see the whole team's day.
  const isManager = role === "ADMIN" || role === "OWNER";
  const scopeWhere = isManager ? {} : { workerId: userId };

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

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

  return NextResponse.json({
    items,
    unread,
    summary: {
      scope: isManager ? "team" : "mine",
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
  });
}

// Mark the user's notifications read. Body: { ids?: string[] } — omit to mark
// all as read.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      read: false,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
