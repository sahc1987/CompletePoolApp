"use client";

import { useEffect, useRef } from "react";
import { SESSION_REFRESH_S } from "@/lib/authConfig";

const REFRESH_MS = SESSION_REFRESH_S * 1000;

/**
 * Keeps the signed-in user's JWT alive while they're working.
 *
 * Every page in the app is server-rendered and reads the session with
 * getServerSession, which decodes the cookie but cannot write one back — in the
 * app router there is no response object to set it on. So nothing in a normal
 * page load ever re-issued the token: it kept the expiry it was minted with at
 * sign-in and then died mid-shift, dropping the user on /login with whatever
 * they were typing lost.
 *
 * GET /api/auth/session is the one route that does re-encode and re-set the
 * cookie (next-auth's session handler), so a periodic ping there slides the
 * expiry forward. It also runs the `jwt` callback, which is what makes the
 * role/active re-check in lib/auth.ts persist rather than being recomputed and
 * thrown away on every request.
 *
 * The ping is deliberately gated on real interaction. A tab nobody has touched
 * stops renewing, so the idle timeout in lib/auth.ts still means something —
 * an unattended tablet signs itself out instead of holding a session open
 * indefinitely.
 */
export default function SessionKeepAlive() {
  const activeSince = useRef(true);
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    const markActive = () => {
      activeSince.current = true;
    };
    const events = ["pointerdown", "keydown", "scroll", "focus"] as const;
    for (const e of events) {
      window.addEventListener(e, markActive, { passive: true });
    }

    async function refresh() {
      if (cancelled) return;
      lastRefresh.current = Date.now();
      activeSince.current = false;
      try {
        const res = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (!res.ok) return; // Transient — the next tick tries again.
        const session = await res.json();
        // An expired cookie, a deleted account, or a deactivated one all come
        // back as `{}` (see the session callback in lib/auth.ts). Send them to
        // sign in from here rather than letting them keep clicking around a
        // stale page whose every server action would throw Unauthorized.
        if (!cancelled && !session?.user) {
          const to = window.location.pathname + window.location.search;
          window.location.replace(`/login?callbackUrl=${encodeURIComponent(to)}`);
        }
      } catch {
        // Offline. Leave the timer running; the session outlives several
        // missed renewals by design.
      }
    }

    const timer = window.setInterval(() => {
      if (activeSince.current) void refresh();
    }, REFRESH_MS);

    // A machine that was asleep may have missed many ticks, and the cookie can
    // be gone by the time it wakes. Check as soon as the tab is looked at again.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      activeSince.current = true;
      if (Date.now() - lastRefresh.current >= REFRESH_MS) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      for (const e of events) window.removeEventListener(e, markActive);
    };
  }, []);

  return null;
}
