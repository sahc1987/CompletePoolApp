"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { Icon, type IconName } from "./icons";
import NotificationBell from "./NotificationBell";
import SessionKeepAlive from "./SessionKeepAlive";
import UserMenu from "./UserMenu";

type NavLink = { href: string; label: string; icon: IconName };

// Role -> nav links. Only routes that actually exist are listed here.
const NAV: Record<Role, NavLink[]> = {
  OWNER: [
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/kpi", label: "Dashboard", icon: "dashboard" },
    { href: "/billing", label: "Billing", icon: "billing" },
    { href: "/users", label: "Team", icon: "users" },
  ],
  ADMIN: [
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/clients", label: "Clients", icon: "users" },
    { href: "/assign", label: "Assign", icon: "clipboard" },
    { href: "/review", label: "Review", icon: "check" },
    { href: "/billing", label: "Billing", icon: "billing" },
    { href: "/materials", label: "Materials", icon: "box" },
    { href: "/estimates", label: "Estimates", icon: "file" },
    { href: "/users", label: "Team", icon: "users" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  WORKER: [
    { href: "/calendar", label: "My schedule", icon: "calendar" },
    { href: "/worker", label: "My tasks", icon: "tasks" },
    { href: "/estimates", label: "Estimates", icon: "file" },
  ],
};

export default function AppShell({
  role,
  name,
  children,
}: {
  role: Role;
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const links = NAV[role];

  return (
    <div className="min-h-screen">
      {/* Renews the session cookie while this tab is in use — see the component. */}
      <SessionKeepAlive />
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur">
        {/* Top row: logo + identity */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <Link href="/calendar" className="shrink-0">
            <img src="/logo-header.svg" alt="Complete Pool Service Inc." className="h-9" />
          </Link>
          <div className="flex shrink-0 items-center gap-2.5">
            <NotificationBell />
            <UserMenu name={name} role={role} />
          </div>
        </div>

        {/* Nav strip: cinematic blue→teal band echoing the reference hero,
            with icon pills. A hairline teal glow separates it from the body. */}
        <nav className="border-b border-teal-500/30 bg-gradient-to-r from-navy-900 via-[#0c3a63] to-[#0a5566]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-3 py-1.5">
            {links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-teal-500 text-navy-900 shadow-sm"
                      : "text-white/85 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  <Icon name={link.icon} size={16} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
