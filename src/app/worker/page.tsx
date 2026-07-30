import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import ActionForm from "@/components/ActionForm";
import { Icon } from "@/components/icons";
import { ModalButton } from "@/components/Modal";
import { card } from "@/components/styles";
import { startTask } from "./actions";
import SubmitTaskForm from "./SubmitTaskForm";
import MaterialRequestForm from "./MaterialRequestForm";

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function WorkerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Active jobs only — approved/cancelled drop off the worker's list.
  const tasks = await prisma.task.findMany({
    where: {
      workerId: session.user.id,
      status: { in: ["SCHEDULED", "IN_PROGRESS", "SUBMITTED", "FLAGGED"] },
    },
    include: {
      client: { select: { name: true, phone: true } },
      pool: { select: { address: true } },
      service: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const materials = await prisma.material.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });

  const requests = await prisma.materialRequest.findMany({
    where: { workerId: session.user.id },
    include: { material: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const taskOptions = tasks.map((t) => ({
    id: t.id,
    label: `${t.client.name} — ${t.service.name}`,
  }));

  const requestStatusStyle: Record<string, string> = {
    PENDING: "bg-pending/10 text-pending",
    APPROVED: "bg-good/10 text-good",
    DENIED: "bg-danger/10 text-danger",
  };

  // Group by when it matters: rework first, then today, tomorrow, later.
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  type Job = (typeof tasks)[number];
  const flagged = tasks.filter((t) => t.status === "FLAGGED");
  const rest = tasks.filter((t) => t.status !== "FLAGGED");

  // Every upcoming day gets its own dated heading. A single "Later" bucket
  // would strand identical recurring jobs with no way to tell them apart.
  const laterByDay = new Map<string, Job[]>();
  for (const t of rest) {
    if (sameDay(t.startTime, now) || sameDay(t.startTime, tomorrow)) continue;
    const key = t.startTime.toDateString();
    laterByDay.set(key, [...(laterByDay.get(key) ?? []), t]);
  }

  const groups: { key: string; label: string; tone: string; tasks: Job[] }[] = [
    { key: "rework", label: "Needs rework", tone: "danger", tasks: flagged },
    {
      key: "today",
      label: `Today · ${fmtDay(now)}`,
      tone: "today",
      tasks: rest.filter((t) => sameDay(t.startTime, now)),
    },
    {
      key: "tomorrow",
      label: `Tomorrow · ${fmtDay(tomorrow)}`,
      tone: "plain",
      tasks: rest.filter((t) => sameDay(t.startTime, tomorrow)),
    },
    ...[...laterByDay.entries()].map(([key, ts]) => ({
      key,
      label: fmtDay(ts[0].startTime),
      tone: "plain",
      tasks: ts,
    })),
  ].filter((g) => g.tasks.length > 0);

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="My"
        accent="jobs"
        subtitle={
          tasks.length === 0
            ? undefined
            : `${tasks.length} active job${tasks.length === 1 ? "" : "s"}`
        }
      />

      {tasks.length === 0 ? (
        <div className={`${card} text-center`}>
          <p className="text-lg font-semibold text-ink">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-muted">
            Nothing assigned right now. New jobs will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <h2
                className={`mb-3 text-sm font-bold uppercase tracking-wider ${
                  g.tone === "danger"
                    ? "text-danger"
                    : g.tone === "today"
                      ? "text-navy-700"
                      : "text-faint"
                }`}
              >
                {g.label}
                <span className="ml-2 font-semibold normal-case tracking-normal text-faint">
                  {g.tasks.length}
                </span>
              </h2>

              <div className="space-y-3">
                {g.tasks.map((t) => (
                  <article
                    key={t.id}
                    className={`${card} p-5 ${
                      t.status === "FLAGGED" ? "border-danger/30" : ""
                    }`}
                  >
                    {/* Time leads: it's what differs between otherwise identical jobs */}
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold leading-none text-ink">
                          {fmtTime(t.startTime)}
                        </span>
                        <span className="text-sm text-faint">{t.durationMin} min</span>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>

                    <div className="text-lg font-semibold leading-tight text-ink">
                      {t.client.name}
                    </div>
                    <div className="text-[15px] text-muted">{t.service.name}</div>

                    {t.notes && (
                      <p className="mt-2 rounded-lg bg-chrome-100 px-3 py-2 text-sm text-navy-900">
                        {t.notes}
                      </p>
                    )}

                    {t.status === "FLAGGED" && t.flagReason && (
                      <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                        Kicked back: {t.flagReason}
                      </p>
                    )}

                    {/* Field actions: navigate + call, one tap each */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(t.pool.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink transition hover:border-navy-500/40 hover:bg-chrome-100"
                      >
                        <Icon name="pin" size={16} className="shrink-0 text-navy-700" />
                        <span className="truncate">{t.pool.address}</span>
                      </a>
                      {t.client.phone && (
                        <a
                          href={`tel:${t.client.phone.replace(/[^\d+]/g, "")}`}
                          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink transition hover:border-navy-500/40 hover:bg-chrome-100"
                          aria-label={`Call ${t.client.name}`}
                        >
                          <Icon name="phone" size={16} className="text-navy-700" />
                          <span className="sm:hidden">Call</span>
                          <span className="hidden sm:inline">{t.client.phone}</span>
                        </a>
                      )}
                    </div>

                    {(t.status === "IN_PROGRESS" || t.status === "SUBMITTED") && (
                      <p className="mt-2 text-xs text-faint">
                        Before/after photos — upload coming soon.
                      </p>
                    )}

                    {/* Primary action: full width, thumb-sized */}
                    <div className="mt-4">
                      {(t.status === "SCHEDULED" || t.status === "FLAGGED") && (
                        <ActionForm
                          action={startTask}
                          hidden={{ taskId: t.id }}
                          label={t.status === "FLAGGED" ? "Start rework" : "Start job"}
                          pendingLabel="Starting…"
                          fullWidth
                        />
                      )}
                      {t.status === "IN_PROGRESS" && (
                        <SubmitTaskForm taskId={t.id} materials={materials} />
                      )}
                      {t.status === "SUBMITTED" && (
                        <p className="rounded-xl bg-surface py-2.5 text-center text-sm font-medium text-faint">
                          Waiting on review
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Occasional task — kept out of the way so it doesn't crowd the job list */}
      <section className="mt-8 space-y-4">
        <ModalButton
          label="Request materials"
          title="Request materials"
          subtitle="Goes straight to the admin inbox."
          variant="ghost"
        >
          <MaterialRequestForm materials={materials} tasks={taskOptions} />
        </ModalButton>

        {requests.length > 0 && (
          <details className={card}>
            <summary className="cursor-pointer font-semibold text-navy-700">
              My requests
              <span className="ml-2 font-normal text-faint">({requests.length})</span>
            </summary>
            <ul className="mt-4 space-y-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-sm last:border-0"
                >
                  <span className="text-ink">
                    {r.material?.name ?? r.description}{" "}
                    <span className="text-faint">× {Number(r.quantityRequested)}</span>
                    {r.urgent && (
                      <span className="ml-1 text-xs font-semibold text-danger">urgent</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {r.responseNote && (
                      <span className="text-xs text-faint">“{r.responseNote}”</span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        requestStatusStyle[r.status]
                      }`}
                    >
                      {r.status[0] + r.status.slice(1).toLowerCase()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </AppShell>
  );
}
