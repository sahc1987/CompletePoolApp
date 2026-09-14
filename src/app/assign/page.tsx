import Link from "next/link";
import { getSchedulingCatalog } from "@/server/services/catalogReads";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ActionForm from "@/components/ActionForm";
import { card } from "@/components/styles";
import { minToHHMM } from "@/lib/schedule";
import AssignForm from "./AssignForm";
import { runRecurrenceExpansion } from "./actions";
import { requirePageSession } from "@/lib/guard";

export default async function AssignPage() {
  const session = await requirePageSession("ADMIN");

  const catalog = await getSchedulingCatalog(session.user);
  if (!catalog.ok) throw new Error(catalog.error);
  const { clients, workers, services, extras, hours, hasClientsWithPools } =
    catalog.data;

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
              basePrice: s.basePrice,
              defaultDurationMin: s.defaultDurationMin,
            }))}
            extras={extras.map((e) => ({
              id: e.id,
              name: e.name,
              price: e.price,
            }))}
            workStart={minToHHMM(hours.startMin)}
            workEnd={minToHHMM(hours.endMin)}
          />
        </div>
      )}
    </AppShell>
  );
}
