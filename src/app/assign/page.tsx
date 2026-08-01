import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ActionForm from "@/components/ActionForm";
import { card } from "@/components/styles";
import { toNumber } from "@/lib/serialize";
import { getWorkHours, minToHHMM } from "@/lib/schedule";
import AssignForm from "./AssignForm";
import { runRecurrenceExpansion } from "./actions";
import { requirePageSession } from "@/lib/guard";

export default async function AssignPage() {
  const session = await requirePageSession("ADMIN");

  const [clients, workers, services, extras, hours] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { pools: { orderBy: { address: "asc" }, select: { id: true, address: true } } },
    }),
    prisma.user.findMany({
      where: { role: "WORKER", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    prisma.extraService.findMany({ orderBy: { name: "asc" } }),
    getWorkHours(),
  ]);

  const hasClientsWithPools = clients.some((c) => c.pools.length > 0);

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Assign a"
        accent="job"
        subtitle="Schedule work for a client and assign it to a worker."
        action={
          <ActionForm
            action={runRecurrenceExpansion}
            hidden={{}}
            label="Generate recurring tasks"
            variant="ghost"
            pendingLabel="Generating…"
          />
        }
      />

      {!hasClientsWithPools ? (
        <div className={card}>
          <p className="text-muted">
            You need at least one client with a pool before you can assign a
            task.{" "}
            <Link href="/clients" className="font-medium text-navy-700 hover:underline">
              Add a client →
            </Link>
          </p>
        </div>
      ) : (
        <div className={`${card} max-w-3xl`}>
          <AssignForm
            clients={clients.map((c) => ({ id: c.id, name: c.name, pools: c.pools }))}
            workers={workers}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              basePrice: toNumber(s.basePrice) ?? 0,
              defaultDurationMin: s.defaultDurationMin,
            }))}
            extras={extras.map((e) => ({
              id: e.id,
              name: e.name,
              price: toNumber(e.price) ?? 0,
            }))}
            workStart={minToHHMM(hours.startMin)}
            workEnd={minToHHMM(hours.endMin)}
          />
        </div>
      )}
    </AppShell>
  );
}
