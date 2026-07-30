import { NextResponse } from "next/server";
import { expandRecurrences } from "@/lib/recurrence";

// Cron entry point for recurrence expansion. Point a scheduler (Vercel Cron,
// GitHub Actions, etc.) at GET /api/cron/recurrence. If CRON_SECRET is set,
// callers must present it as `Authorization: Bearer <secret>` or `?key=`.
// Must never be statically evaluated: this route mutates the database, so it has
// to execute per-request rather than being prerendered and cached at build time.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}` && url.searchParams.get("key") !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const created = await expandRecurrences();
  return NextResponse.json({ created });
}
