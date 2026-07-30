"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass } from "@/components/styles";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email or password is wrong.");
      return;
    }

    router.push("/calendar");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — cinematic blue→teal hero echoing the reference design */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-navy-900 via-[#0c3a5e] to-[#0a5566] lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* soft decorative glows */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-500/25 blur-3xl" />

        <img src="/logo-header.svg" alt="Complete Pool Service Inc." className="relative h-10 brightness-0 invert" />

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Run every job,
            <br />
            <span className="text-teal-400">start to signed.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/70">
            Scheduling, worker assignments, materials, and estimates — the whole
            operation for Complete Pool Service Inc., in one place.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-white/80">
            {["Assign and reschedule jobs on a shared calendar", "Track materials and stock in real time", "Build and sign estimates on-site"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-500 text-navy-900">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Complete Pool Service Inc.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <img
            src="/logo-full.svg"
            alt="Complete Pool Service Inc."
            className="mx-auto mb-8 w-52 lg:hidden"
          />
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-ink">Welcome back</h2>
            <p className="mt-1 text-sm text-muted">Sign in to your account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-b from-teal-700 to-teal-800 py-3 font-bold text-white shadow-sm transition hover:from-teal-800 hover:to-teal-900 hover:shadow-md active:scale-[.99] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
