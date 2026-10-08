import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { getDayRoute } from "@/server/services/routeReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/day-route?day=YYYY-MM-DD
 *
 * One business day's stops in visit order, for the app's map screen — the same
 * data as the web calendar's Map tab. A worker gets only their own stops and
 * no prices. `day` is optional and defaults to today in the business's zone;
 * the response carries `today`, `prevDay` and `nextDay` so the app never does
 * date arithmetic itself.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const day = new URL(req.url).searchParams.get("day") ?? undefined;
  return respond(await getDayRoute(auth.actor, day));
});
