import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { ModalButton } from "@/components/Modal";
import { money } from "@/lib/serialize";
import EstimateForm from "./EstimateForm";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-ink/10 text-muted",
  PRESENTED: "bg-aqua/10 text-aqua",
  APPROVED: "bg-good/10 text-good",
  DECLINED: "bg-danger/10 text-danger",
};

export default async function EstimatesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [clients, estimates] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { pools: { orderBy: { address: "asc" }, select: { id: true, address: true } } },
    }),
    prisma.estimate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Estimates &"
        accent="quotes"
        subtitle="Build a quote, present it on-site, and capture the signature in person."
        action={
          clients.length > 0 && (
            <ModalButton
              label="New estimate"
              title="New estimate"
              subtitle="Start a draft — you'll add line items on the next screen."
            >
              <EstimateForm
                clients={clients.map((c) => ({ id: c.id, name: c.name, pools: c.pools }))}
              />
            </ModalButton>
          )
        }
      />

      {estimates.length === 0 ? (
        <p className="text-muted">No estimates yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line/80 bg-white shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line/70 bg-surface/60 text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3 text-left font-semibold sm:px-5">Client</th>
                <th className="px-4 py-3 text-left font-semibold sm:px-5">Status</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-5">Total</th>
                <th className="hidden px-5 py-3 text-left font-semibold md:table-cell">Created by</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {estimates.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-chrome-100/40">
                  <td className="px-4 py-4 font-semibold text-ink sm:px-5">{e.client.name}</td>
                  <td className="px-4 py-4 sm:px-5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[e.status]}`}>
                      {e.status[0] + e.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums text-ink sm:px-5">{money(e.total)}</td>
                  <td className="hidden px-5 py-4 text-muted md:table-cell">{e.createdBy.name}</td>
                  <td className="px-4 py-4 text-right sm:px-5">
                    <Link href={`/estimates/${e.id}`} className="font-semibold text-navy-700 hover:underline">
                      Open
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
