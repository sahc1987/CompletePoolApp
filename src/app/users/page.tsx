import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/serialize";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/DeleteButton";
import { ModalButton } from "@/components/Modal";
import RoleForm from "./RoleForm";
import AddUserForm from "./AddUserForm";
import ResetPasswordForm from "./ResetPasswordForm";
import { toggleUserActive } from "./actions";
import { requirePageSession } from "@/lib/guard";
import { canAdminister, grantableRoles } from "@/lib/privileges";

const ROLE_BLURB: Record<string, string> = {
  OWNER: "Dashboard + billing, and can manage the team",
  ADMIN: "Runs day-to-day operations",
  WORKER: "Sees and updates their own jobs",
};

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function UsersPage() {
  const session = await requirePageSession("ADMIN", "OWNER");

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { _count: { select: { tasksAssigned: true } } },
  });

  const activeManagers = users.filter(
    (u) => u.active && (u.role === "ADMIN" || u.role === "OWNER")
  ).length;

  // The last active admin/owner must keep their privileges, or nobody could
  // administer the system afterwards; you also can't disable yourself.
  // What this actor may hand out, and whom they may act on at all. An admin
  // can no longer touch owner accounts, so the controls for them are hidden
  // rather than shown and then rejected.
  const actorRole = session.user.role;
  const roleOptions = grantableRoles(actorRole);

  const rows = users.map((u) => {
    const isSelf = u.id === session.user.id;
    const isLastManager =
      (u.role === "ADMIN" || u.role === "OWNER") && u.active && activeManagers <= 1;
    const administrable = canAdminister(actorRole, u.role);
    return {
      u,
      isSelf,
      administrable,
      locked: isSelf || isLastManager || !administrable,
    };
  });

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Team &"
        accent="privileges"
        subtitle="Add people, set what they can do, and disable accounts that shouldn't sign in."
        action={
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-muted shadow-sm">
              {users.filter((u) => u.active).length} active
            </span>
            <ModalButton
              label="Add team member"
              title="Add a team member"
              subtitle="They can sign in as soon as you save."
              size="lg"
            >
              <AddUserForm roleOptions={roleOptions} />
            </ModalButton>
          </div>
        }
      />

      {/* Mobile: one card per teammate — the role picker and actions stack so
          nothing gets pushed off-screen. */}
      <div className="space-y-3 sm:hidden">
        {rows.map(({ u, isSelf, administrable, locked }) => (
          <div
            key={u.id}
            className={`rounded-2xl border border-line/80 bg-white p-4 shadow-card ${
              u.active ? "" : "opacity-70"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${
                  u.active ? "bg-navy-700" : "bg-faint"
                }`}
              >
                {initials(u.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-ink">{u.name}</span>
                  {isSelf && (
                    <span className="shrink-0 rounded-full bg-chrome-100 px-2 py-0.5 text-[11px] font-bold text-navy-700">
                      You
                    </span>
                  )}
                  <span
                    className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      u.active ? "bg-good/10 text-good" : "bg-pending/10 text-pending"
                    }`}
                  >
                    {u.active ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="truncate text-[13px] text-muted">{u.email}</div>
              </div>
            </div>

            <div className="mt-3">
              <RoleForm userId={u.id} role={u.role} disabled={locked} options={roleOptions} />
              <div className="mt-1 text-[12px] text-faint">{ROLE_BLURB[u.role]}</div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/60 pt-3">
              <span className="text-[12px] text-faint">
                {u._count.tasksAssigned || 0} job{u._count.tasksAssigned === 1 ? "" : "s"}
                {u.hourlyRate !== null && (
                  <> · ${toNumber(u.hourlyRate)?.toFixed(2)}/hr</>
                )}
              </span>
              <div className="flex items-center gap-1">
                <Link
                  href={`/users/${u.id}`}
                  className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100"
                >
                  Details
                </Link>
                {administrable && <ResetPasswordForm userId={u.id} name={u.name} />}
                {locked ? (
                  <span className="whitespace-nowrap px-2.5 py-1.5 text-[13px] font-medium text-faint">
                    {isSelf ? "—" : administrable ? "Last manager" : "Above you"}
                  </span>
                ) : (
                  <DeleteButton
                    action={toggleUserActive}
                    hidden={{ userId: u.id }}
                    confirm={
                      u.active
                        ? `Disable ${u.name}? They keep their history but can't sign in.`
                        : `Re-enable ${u.name}?`
                    }
                    label={u.active ? "Disable" : "Enable"}
                    className={
                      u.active
                        ? "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-faint transition hover:bg-danger/10 hover:text-danger"
                        : "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-good transition hover:bg-good/10"
                    }
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: full table. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line/80 bg-white shadow-card sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line/70 bg-surface/60 text-[11px] uppercase tracking-wider text-faint">
              <th className="px-5 py-3 text-left font-semibold">Person</th>
              <th className="px-5 py-3 text-left font-semibold">Privileges</th>
              <th className="px-5 py-3 text-left font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Pay</th>
              <th className="px-5 py-3 text-right font-semibold">Jobs</th>
              <th className="px-5 py-3 text-right font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map(({ u, isSelf, administrable, locked }) => {
              return (
                <tr
                  key={u.id}
                  className={`transition-colors hover:bg-chrome-100/40 ${
                    u.active ? "" : "opacity-60"
                  }`}
                >
                  <td className="px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${
                          u.active ? "bg-navy-700" : "bg-faint"
                        }`}
                      >
                        {initials(u.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{u.name}</span>
                          {isSelf && (
                            <span className="rounded-full bg-chrome-100 px-2 py-0.5 text-[11px] font-bold text-navy-700">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] text-muted">{u.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4 sm:px-5">
                    <RoleForm userId={u.id} role={u.role} disabled={locked} options={roleOptions} />
                    <div className="mt-1 text-[12px] text-faint">{ROLE_BLURB[u.role]}</div>
                  </td>

                  <td className="hidden px-5 py-4 sm:table-cell">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        u.active ? "bg-good/10 text-good" : "bg-pending/10 text-pending"
                      }`}
                    >
                      {u.active ? "Active" : "Disabled"}
                    </span>
                    {!u.active && (
                      <div className="mt-1 text-[12px] text-faint">Can&apos;t sign in</div>
                    )}
                  </td>

                  <td className="hidden px-5 py-4 text-right tabular-nums text-muted sm:table-cell">
                    {u.hourlyRate === null ? (
                      "—"
                    ) : (
                      <>
                        <span className="font-semibold text-ink">
                          ${toNumber(u.hourlyRate)?.toFixed(2)}
                        </span>
                        <span className="text-faint">/hr</span>
                      </>
                    )}
                  </td>

                  <td className="hidden px-5 py-4 text-right tabular-nums text-muted sm:table-cell">
                    {u._count.tasksAssigned || "—"}
                  </td>

                  <td className="px-4 py-4 sm:px-5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/users/${u.id}`}
                        className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100"
                      >
                        Details
                      </Link>
                      {administrable && <ResetPasswordForm userId={u.id} name={u.name} />}
                      {locked ? (
                        <span
                          className="whitespace-nowrap px-2.5 py-1.5 text-[13px] font-medium text-faint"
                          title={
                            isSelf
                              ? "You can't disable your own account"
                              : administrable
                                ? "The last active admin/owner can't be disabled"
                                : "This account outranks yours"
                          }
                        >
                          {isSelf ? "—" : administrable ? "Last manager" : "Above you"}
                        </span>
                      ) : (
                        <DeleteButton
                          action={toggleUserActive}
                          hidden={{ userId: u.id }}
                          confirm={
                            u.active
                              ? `Disable ${u.name}? They keep their history but can't sign in.`
                              : `Re-enable ${u.name}?`
                          }
                          label={u.active ? "Disable" : "Enable"}
                          className={
                            u.active
                              ? "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-faint transition hover:bg-danger/10 hover:text-danger"
                              : "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-good transition hover:bg-good/10"
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-faint">
        Accounts are never deleted — disabling keeps their jobs, approvals, and
        payment history intact while blocking sign-in.
      </p>

    </AppShell>
  );
}
