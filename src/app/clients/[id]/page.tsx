import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import DeleteButton from "@/components/DeleteButton";
import { ModalButton } from "@/components/Modal";
import { card } from "@/components/styles";
import ClientForm from "../ClientForm";
import PoolForm from "../PoolForm";
import { deleteClient, deletePool } from "../actions";
import { requirePageSession } from "@/lib/guard";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requirePageSession("ADMIN");

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      pools: { orderBy: { address: "asc" } },
      _count: { select: { tasks: true, estimates: true } },
    },
  });
  if (!client) notFound();

  const deletable = client._count.tasks === 0 && client._count.estimates === 0;

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted">
        <Link href="/clients" className="hover:underline">
          Clients
        </Link>
        <span>/</span>
        <span className="text-ink">{client.name}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-4 text-lg font-semibold text-ink">Details</h2>
          <ClientForm
            client={{
              id: client.id,
              name: client.name,
              phone: client.phone,
              email: client.email,
              address: client.address,
              notes: client.notes,
            }}
          />
          <div className="mt-6 border-t border-line pt-4">
            {deletable ? (
              <DeleteButton
                action={deleteClient}
                hidden={{ id: client.id }}
                confirm={`Delete ${client.name}? This can't be undone.`}
                label="Delete client"
              />
            ) : (
              <p className="text-sm text-muted">
                Has {client._count.tasks} task(s) and {client._count.estimates}{" "}
                estimate(s) on record — can&apos;t be deleted.
              </p>
            )}
          </div>
        </section>

        <section className={card}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">
              Pools ({client.pools.length})
            </h2>
            <ModalButton
              label="Add pool"
              title="Add a pool"
              subtitle={`A new service address for ${client.name}.`}
              variant="ghost"
            >
              <PoolForm clientId={client.id} />
            </ModalButton>
          </div>

          {/* One compact row per pool, editing in a dialog. Rendering every pool
              as an open form instead makes the page unusable past a handful. */}
          <div className="divide-y divide-line/60">
            {client.pools.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {p.address}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {[p.size, p.type].filter(Boolean).join(" · ") ||
                      "No size or type set"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ModalButton
                    label="Edit"
                    title="Edit pool"
                    subtitle={p.address}
                    variant="ghost"
                    icon={null}
                  >
                    <PoolForm clientId={client.id} pool={p} />
                  </ModalButton>
                  <DeleteButton
                    action={deletePool}
                    hidden={{ id: p.id, clientId: client.id }}
                    confirm={`Delete the pool at ${p.address}?`}
                    label="Delete"
                    className="rounded-full px-3 py-1.5 text-sm font-semibold text-danger transition hover:bg-danger/10"
                  />
                </div>
              </div>
            ))}
            {client.pools.length === 0 && (
              <p className="text-sm text-muted">No pools yet.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
