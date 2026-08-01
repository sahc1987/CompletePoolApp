import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { card } from "@/components/styles";
import ProfileForm from "./ProfileForm";
import PasswordForm from "./PasswordForm";
import { requirePageSession } from "@/lib/guard";

const ROLE_BLURB: Record<string, string> = {
  OWNER: "Read-only across the app, with full access to the KPI dashboard.",
  ADMIN: "Runs day-to-day operations: clients, scheduling, review, materials.",
  WORKER: "Sees and updates their own assigned jobs.",
};

export default async function AccountPage() {
  const session = await requirePageSession();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true, role: true, createdAt: true },
  });
  if (!user) redirect("/login");

  const roleLabel = user.role[0] + user.role.slice(1).toLowerCase();

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="My"
        accent="account"
        subtitle="Your profile, role, and sign-in security."
      />

      <div className="space-y-6">
        {/* Overview */}
        <section className={card}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-navy-700 text-lg font-bold text-white ring-4 ring-navy-700/10">
              {(user.name.trim()[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-ink">{user.name}</div>
              <div className="text-sm text-muted">{user.email}</div>
            </div>
            <span className="ml-auto rounded-full bg-chrome-100 px-3 py-1 text-sm font-semibold text-navy-700">
              {roleLabel}
            </span>
          </div>
          <div className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-faint">Role</div>
              <div className="text-ink">{roleLabel} — {ROLE_BLURB[user.role]}</div>
            </div>
            <div>
              <div className="text-faint">Member since</div>
              <div className="text-ink">
                {user.createdAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Profile */}
        <section className={card}>
          <h2 className="mb-1 text-lg font-semibold text-ink">Profile</h2>
          <p className="mb-4 text-sm text-muted">
            Update your name and contact number. Email and role are managed by an
            admin.
          </p>
          <ProfileForm name={user.name} phone={user.phone} />
        </section>

        {/* Security */}
        <section className={card}>
          <h2 className="mb-1 text-lg font-semibold text-ink">Password</h2>
          <p className="mb-4 text-sm text-muted">
            Change your password. You&apos;ll need your current one to confirm.
          </p>
          <PasswordForm />
        </section>
      </div>
    </AppShell>
  );
}
