import Link from "next/link";

/**
 * Where the read-only demo account lands when it tries to change something
 * (see requireUser in lib/guard.ts). A plain explanation beats an error page.
 */
export default function DemoReadOnlyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold text-ink">This is a read-only demo</h1>
        <p className="mt-2 text-sm text-muted">
          You can look around every screen, but the demo account can&apos;t save,
          change or delete anything. Nothing you did was saved.
        </p>
        <Link
          href="/calendar"
          className="mt-6 inline-block rounded-full bg-teal-700 px-5 py-2.5 font-semibold text-white transition hover:bg-teal-800"
        >
          Keep exploring
        </Link>
      </div>
    </main>
  );
}
