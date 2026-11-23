import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { listPoolWaterTests } from "@/server/services/waterTests";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/pools/:id/water-tests?limit=12
 *
 * A pool's recent readings, newest first — admin and owner. `limit` is
 * clamped by the service (1–50).
 */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  return respond(await listPoolWaterTests(auth.actor, params.id, limit));
});
