import { NextResponse } from "next/server";
import { cronRequestAllowed } from "@/server/api/cronAuth";
import { purgeExpiredPhotos } from "@/server/services/photos";
import { PHOTO_RETENTION_DAYS } from "@/server/storage/photoStorage";

// Mutates storage and the database, so it must execute per request rather than
// being prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/photo-retention
 *
 * Deletes task photos past the retention window — six months — along with the
 * objects behind them. Photos of customers' properties are not kept forever.
 *
 * Each run is bounded, so a long backlog is cleared over several days rather
 * than in one request that times out.
 */
export async function GET(req: Request) {
  if (!cronRequestAllowed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await purgeExpiredPhotos();
  if (!result.ok) {
    // Storage not configured is the usual cause, and it is not a failure worth
    // alerting on — there is nothing stored to purge.
    return NextResponse.json({ skipped: result.error }, { status: 200 });
  }

  return NextResponse.json({
    deleted: result.data.deleted,
    retentionDays: PHOTO_RETENTION_DAYS,
  });
}
