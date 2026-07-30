"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

type Notification = {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* offline / transient — keep last known state */
    }
  }, []);

  // Poll every 20s so schedule/service changes surface without a refresh.
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications", { method: "POST", body: "{}" });
  }

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.read) {
      await fetch("/api/notifications", {
        method: "POST",
        body: JSON.stringify({ ids: [n.id] }),
      });
      load();
    }
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread > 0) markAllRead();
        }}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition hover:bg-chrome-100 hover:text-ink"
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            <button
              onClick={markAllRead}
              className="text-xs font-medium text-navy-700 hover:underline"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-faint">
                Nothing yet.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left transition last:border-0 hover:bg-chrome-100 ${
                    n.read ? "" : "bg-navy-700/[0.04]"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.read ? "bg-transparent" : "bg-navy-700"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{n.message}</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
