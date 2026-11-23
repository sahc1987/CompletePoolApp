import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { suggestRoute } from "@/server/services/routePlanning";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/day-route/suggest?day=YYYY-MM-DD&workerId=… (admin) — a proposed
 * visit order for one worker's day, nearest stop first. Saves nothing.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  const q = new URL(req.url).searchParams;
  return respond(
    await suggestRoute(auth.actor, { day: q.get("day") ?? "", workerId: q.get("workerId") ?? "" })
  );
});
