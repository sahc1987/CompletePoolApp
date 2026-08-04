"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass } from "@/components/styles";
import { getLoginFeedback } from "./actions";

// Selling points on the hero panel, each with its own glyph so the list reads
// as three distinct capabilities rather than three identical ticks.
const HIGHLIGHTS = [
  {
    title: "Shared crew calendar",
    body: "Assign and reschedule jobs without a phone call.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>
    ),
  },
  {
    title: "Live materials & stock",
    body: "Know what is on the truck before you drive out.",
    icon: (
      <>
        <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
        <path d="M3 7.5 12 12l9-4.5M12 12v9" />
      </>
    ),
  },
  {
    title: "Estimates signed on-site",
    body: "Build it, price it, and collect a signature at the pool.",
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 15l2 2 4-4" />
      </>
    ),
  },
];

function Icon({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Seconds left on a lockout. The server is the real gate; this only keeps the
  // form from inviting attempts that are guaranteed to fail.
  const [lockedFor, setLockedFor] = useState(0);

  // Tick the lockout down to zero.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setTimeout(() => {
      setLockedFor((s) => s - 1);
      // Drop the lockout message as the window closes, so it isn't left on
      // screen claiming a wait that has already elapsed.
      if (lockedFor === 1) setError(null);
    }, 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  const locked = lockedFor > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || loading) return;
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      // NextAuth collapses every failure into one opaque error, so ask the
      // server whether this was a bad password or an active lockout.
      const fb = await getLoginFeedback(email);
      setLoading(false);

      if (fb.lockedSeconds > 0) {
        setLockedFor(fb.lockedSeconds);
        setPassword("");
        setError(
          `Too many failed attempts. Try again in ${fb.lockedSeconds} seconds.`
        );
      } else if (fb.attemptsLeft > 0) {
        setError(
          `Email or password is wrong. ${fb.attemptsLeft} ${
            fb.attemptsLeft === 1 ? "attempt" : "attempts"
          } left before your account is locked for 30 seconds.`
        );
      } else {
        setError("Email or password is wrong.");
      }
      return;
    }

    setLoading(false);
    router.push("/calendar");
    router.refresh();
  }

  // Caps Lock silently breaks a password entry more often than anything else,
  // so warn while the field has focus instead of spending an attempt on it.
  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — cinematic blue→teal hero with a slow caustic drift */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-navy-900 via-[#0c3a5e] to-[#0a5566] lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-16">
        {/* Layered glows — the light in the water. */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-[30rem] w-[30rem] animate-drift rounded-full bg-teal-400/25 blur-3xl" />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-[32rem] w-[32rem] animate-drift rounded-full bg-teal-500/20 blur-3xl"
          style={{ animationDelay: "-9s" }}
        />
        {/* Waterline: a pair of soft waves anchoring the bottom edge. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full"
        >
          <path
            d="M0 120c150-45 300 45 450 30s300-90 450-60 250 75 300 60v50H0z"
            fill="#14b8c9"
            opacity="0.10"
          />
          <path
            d="M0 150c180-40 320 35 500 25s280-65 430-40 220 55 270 45v20H0z"
            fill="#3dd0de"
            opacity="0.08"
          />
        </svg>

        <img
          src="/logo-header.svg"
          alt="Complete Pool Service Inc."
          className="relative h-10 w-auto self-start brightness-0 invert animate-rise"
        />

        <div className="relative max-w-lg">
          <span
            className="mb-6 inline-flex animate-rise items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white/85 backdrop-blur-sm"
            style={{ animationDelay: "60ms" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            <span>Field operations platform</span>
          </span>

          <h1
            className="animate-rise text-[2.75rem] font-bold leading-[1.08] tracking-tight text-white xl:text-5xl"
            style={{ animationDelay: "120ms" }}
          >
            Run every job,
            <br />
            <span className="bg-gradient-to-r from-teal-400 to-teal-300 bg-clip-text text-transparent">
              start to signed.
            </span>
          </h1>
          <p
            className="mt-5 animate-rise text-[15px] leading-relaxed text-white/70"
            style={{ animationDelay: "180ms" }}
          >
            Scheduling, worker assignments, materials, and estimates — the whole
            operation for Complete Pool Service Inc., in one place.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h, i) => (
              <li
                key={h.title}
                className="flex animate-rise items-start gap-4"
                style={{ animationDelay: `${240 + i * 80}ms` }}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-teal-300 backdrop-blur-sm">
                  <Icon className="h-5 w-5">{h.icon}</Icon>
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-white">
                    {h.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-white/60">
                    {h.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/45">
          © {new Date().getFullYear()} Complete Pool Service Inc.
        </p>
      </section>

      {/* Form panel */}
      <section className="relative flex items-center justify-center px-5 py-10 sm:px-8">
        {/* On small screens the hero is gone, so a faint teal wash keeps the
            page from reading as a bare white form. */}
        <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-teal-300/25 blur-3xl lg:hidden" />

        <div className="relative w-full max-w-[26rem] animate-rise">
          <img
            src="/logo-full.svg"
            alt="Complete Pool Service Inc."
            className="mx-auto mb-8 w-48 lg:hidden"
          />

          <div className="rounded-3xl border border-line/70 bg-white/85 p-7 shadow-lift backdrop-blur-xl sm:p-9">
            <div className="mb-7">
              <h2 className="text-[26px] font-bold tracking-tight text-navy-900">
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                Sign in to your account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
              <div>
                <label htmlFor="email" className={labelClass}>
                  Email
                </label>
                <div className="relative">
                  <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint">
                    <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
                    <path d="m3.5 7 8.5 6 8.5-6" />
                  </Icon>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@completepool.com"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputClass} pl-12`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className={labelClass}>
                  Password
                </label>
                <div className="relative">
                  <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint">
                    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
                    <path d="M8 10.5V7a4 4 0 1 1 8 0v3.5" />
                  </Icon>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={trackCaps}
                    onKeyDown={trackCaps}
                    onBlur={() => setCapsOn(false)}
                    className={`${inputClass} pl-12 pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-faint transition hover:bg-chrome-100 hover:text-navy-700"
                  >
                    <Icon className="h-5 w-5">
                      {showPassword ? (
                        <>
                          <path d="M3 3l18 18" />
                          <path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" />
                          <path d="M9.4 5.3A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.4 3.4M6.2 6.7C4.1 8.1 3 10.2 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.9-.9" />
                        </>
                      ) : (
                        <>
                          <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7z" />
                          <circle cx="12" cy="12" r="2.75" />
                        </>
                      )}
                    </Icon>
                  </button>
                </div>
                {capsOn && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-warn">
                    <Icon className="h-3.5 w-3.5">
                      <path d="M12 4 4 13h4v7h8v-7h4z" />
                    </Icon>
                    Caps Lock is on
                  </p>
                )}
              </div>

              {/* While locked, the live countdown replaces the stored message so
                  the number on screen stays truthful. */}
              {(locked || error) && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/[0.07] px-3.5 py-3 text-sm text-danger"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5M12 16h.01" />
                  </Icon>
                  <span>
                    {locked
                      ? `Too many failed attempts. Try again in ${lockedFor} second${
                          lockedFor === 1 ? "" : "s"
                        }.`
                      : error}
                  </span>
                </p>
              )}

              <button
                type="submit"
                disabled={loading || locked}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-teal-700 to-teal-800 py-3.5 font-bold text-white shadow-sm transition hover:from-teal-800 hover:to-teal-900 hover:shadow-lift active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm"
              >
                {loading && (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      opacity="0.3"
                    />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {locked
                  ? `Locked — ${lockedFor}s`
                  : loading
                    ? "Signing in…"
                    : "Sign in"}
              </button>
            </form>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint">
            <Icon className="h-3.5 w-3.5">
              <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
              <path d="M8 10.5V7a4 4 0 1 1 8 0v3.5" />
            </Icon>
            Secure sign-in · Contact an administrator for access
          </p>
        </div>
      </section>
    </main>
  );
}
