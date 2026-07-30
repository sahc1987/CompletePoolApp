"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";
import { Icon } from "./icons";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function UserMenu({ name, role }: { name: string; role: Role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const roleLabel = role[0] + role.slice(1).toLowerCase();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 transition hover:bg-chrome-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-700 text-xs font-bold text-white">
          {initials(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold leading-tight text-ink">{name}</span>
          <span className="block text-[11px] leading-tight text-faint">{roleLabel}</span>
        </span>
        <span className={`text-faint transition ${open ? "rotate-180" : ""}`}>
          <Icon name="chevron" size={16} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-white shadow-lift"
        >
          <div className="border-b border-line px-4 py-3">
            <div className="text-sm font-semibold text-ink">{name}</div>
            <div className="text-xs text-faint">{roleLabel}</div>
          </div>
          <div className="p-1.5">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-chrome-100"
            >
              <Icon name="user" size={17} />
              My account
            </Link>
            <button
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
            >
              <Icon name="logout" size={17} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
