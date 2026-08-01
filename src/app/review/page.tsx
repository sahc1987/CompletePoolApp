import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ActionForm from "@/components/ActionForm";
import { card } from "@/components/styles";
import { money } from "@/lib/serialize";
import { approveTask } from "./actions";
import FlagForm from "./FlagForm";
import { requirePageSession } from "@/lib/guard";

function fmt(d: Date) {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ReviewPage() {
  const session = await requirePageSession("ADMIN");

  const tasks = await prisma.task.findMany({
    where: { status: "SUBMITTED" },
    include: {
      client: { select: { name: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
      worker: { select: { name: true } },
      extras: { include: { extraService: { select: { name: true } } } },
    },
    orderBy: { submittedAt: "asc" },
  });

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Review"
        accent="queue"
        subtitle="Approve finished work to bill it, or flag it back to the worker."
        action={
          <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-muted shadow-sm">
            {tasks.length} awaiting review
          </span>
        }
      />

      {tasks.length === 0 ? (
        <div className={`${card} text-center`}>
          <p className="text-lg font-semibold text-ink">All caught up</p>
          <p className="mt-1 text-sm text-muted">
            Nothing is waiting on review. Submitted jobs land here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((t) => (
            <div key={t.id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-ink">
                    {t.client.name} — {t.service.name}
                  </div>
                  <div className="text-sm text-muted">{t.pool.address}</div>
                  <div className="mt-1 text-sm text-muted">
                    {t.worker.name} · submitted{" "}
                    {t.submittedAt ? fmt(t.submittedAt) : "—"}
                  </div>
                  {t.extras.length > 0 && (
                    <div className="mt-1 text-sm text-muted">
                      Extras: {t.extras.map((e) => e.extraService.name).join(", ")}
                    </div>
                  )}
                  <div className="mt-1 font-medium text-ink">{money(t.price)}</div>
                </div>

                <div className="flex flex-col gap-3 sm:w-64">
                  <ActionForm
                    action={approveTask}
                    hidden={{ taskId: t.id }}
                    label="Approve"
                    pendingLabel="Approving…"
                  />
                  <FlagForm taskId={t.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
