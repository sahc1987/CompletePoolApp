import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { toNumber } from "@/lib/serialize";
import { paidAmount } from "@/lib/billing";
import { getWorkHours, minToHHMM } from "@/lib/schedule";
import CalendarView, { type CalendarTask } from "./CalendarView";

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isWorker = session.user.role === "WORKER";
  const isAdmin = session.user.role === "ADMIN";

  // Worker sees only their own tasks; admin/owner see everything.
  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(isWorker ? { workerId: session.user.id } : {}),
    },
    include: {
      client: { select: { name: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
      bill: { include: { payments: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const calendarTasks: CalendarTask[] = tasks.map((t) => {
    const start = t.startTime;
    const end = new Date(start.getTime() + t.durationMin * 60_000);
    const billAmount = t.bill ? toNumber(t.bill.amount) ?? 0 : 0;
    const billPaid = t.bill ? paidAmount(t.bill.payments) : 0;
    return {
      id: t.id,
      title: t.service.name,
      clientName: t.client.name,
      address: t.pool.address,
      // Worker never sees price, matching the permission matrix.
      price: isWorker ? null : toNumber(t.price),
      workerId: t.workerId,
      workerName: t.worker.name,
      serviceId: t.serviceId,
      durationMin: t.durationMin,
      start: start.toISOString(),
      end: end.toISOString(),
      status: t.status,
      // Billing is admin-only (workers never see money).
      bill:
        isAdmin && t.bill
          ? {
              amount: billAmount,
              paid: billPaid,
              balance: Math.round((billAmount - billPaid) * 100) / 100,
              status: t.bill.status,
              method: t.bill.method,
              paidAt: t.bill.paidAt ? t.bill.paidAt.toISOString() : null,
            }
          : null,
    };
  });

  // Only admins can edit; fetch the option lists they need for the editor.
  const [workers, services] = isAdmin
    ? await Promise.all([
        prisma.user.findMany({
          where: { role: "WORKER", active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.service.findMany({
          select: { id: true, name: true, basePrice: true, defaultDurationMin: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []];

  // Build the date from local parts. toISOString() is UTC, which lands the
  // calendar on tomorrow every evening once local time crosses UTC midnight
  // (e.g. 8pm EDT = 00:00 UTC) — and disagreed with "Today" on /worker.
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const initialDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Calendar slots follow the configured workday, so the grid matches the hours
  // jobs are actually allowed in. One slot of padding on each side keeps a job
  // at the very edge from being clipped.
  const hours = await getWorkHours();
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
        workers={workers}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          basePrice: toNumber(s.basePrice) ?? 0,
          defaultDurationMin: s.defaultDurationMin,
        }))}
      />
    </AppShell>
  );
}
