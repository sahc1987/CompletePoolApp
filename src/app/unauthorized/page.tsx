import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Not allowed</h1>
        <p className="mt-2 text-sm text-muted">
          Your account doesn&apos;t have access to that page. If you think this is
          a mistake, ask an admin to check your role.
        </p>
        <Link
          href="/calendar"
          className="mt-6 inline-block rounded-lg bg-navy-700 px-4 py-2 font-semibold text-white transition hover:bg-navy-900"
        >
          Back to calendar
        </Link>
      </div>
    </main>
  );
}
