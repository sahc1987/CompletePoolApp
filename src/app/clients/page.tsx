import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { ModalButton } from "@/components/Modal";
import ClientForm from "./ClientForm";
import { requirePageSession } from "@/lib/guard";

export default async function ClientsPage() {
  const session = await requirePageSession("ADMIN");

  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { pools: true, tasks: true } } },
  });

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Clients &"
        accent="pools"
        subtitle="Everyone you service, and the pools at each address."
        action={
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-muted shadow-sm">
              {clients.length} total
            </span>
            <ModalButton
              label="Add client"
              title="Add a client"
              subtitle="You can add their pools once the client exists."
            >
              <ClientForm />
            </ModalButton>
          </div>
        }
      />

      {clients.length === 0 ? (
        <p className="text-muted">No clients yet — add your first one above.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line/80 bg-white shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line/70 bg-surface/60 text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3 text-left font-semibold sm:px-5">Name</th>
                <th className="px-4 py-3 text-left font-semibold sm:px-5">Phone</th>
                <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Pools</th>
                <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Tasks</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {clients.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-chrome-100/40">
                  <td className="px-4 py-4 font-semibold text-ink sm:px-5">{c.name}</td>
                  <td className="px-4 py-4 text-muted sm:px-5">{c.phone ?? "—"}</td>
                  <td className="hidden px-5 py-4 text-right tabular-nums text-muted sm:table-cell">{c._count.pools}</td>
                  <td className="hidden px-5 py-4 text-right tabular-nums text-muted sm:table-cell">{c._count.tasks}</td>
                  <td className="px-4 py-4 text-right sm:px-5">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-semibold text-navy-700 hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
