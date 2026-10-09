import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { getAgenda } from "@/server/services/agendaReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agenda?day=YYYY-MM-DD
 *
 * The mobile schedule: the Monday–Sunday week containing `day` (job count per
 * day) plus that day's jobs in full. `day` defaults to today in the business's
 * zone, and the response names today and the neighbouring weeks, so the app
 * never does date arithmetic. Redacted by role like the web calendar.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const day = new URL(req.url).searchParams.get("day") ?? undefined;
  return respond(await getAgenda(auth.actor, day));
});
