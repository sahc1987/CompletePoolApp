import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { endSeries } from "@/server/services/scheduling";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/end-series
 *
 * Makes this job the last of its repeating series. Later jobs in the series
 * that nobody has started are cancelled; the response says how many.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  return respond(await endSeries(auth.actor, { taskId: params.id }));
});
