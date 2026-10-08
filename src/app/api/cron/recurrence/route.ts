import { NextResponse } from "next/server";
import { expandRecurrences } from "@/lib/recurrence";
import { cronRequestAllowed } from "@/server/api/cronAuth";

// Cron entry point for recurrence expansion. Point a scheduler (Vercel Cron,
// GitHub Actions, etc.) at GET /api/cron/recurrence. If CRON_SECRET is set,
// callers must present it as `Authorization: Bearer <secret>` or `?key=`.
// Must never be statically evaluated: this route mutates the database, so it has
// to execute per-request rather than being prerendered and cached at build time.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronRequestAllowed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const created = await expandRecurrences();
  return NextResponse.json({ created });
}
