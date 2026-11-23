import { rankWorkersSchema } from "@/contracts/routePlan";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { rankWorkers } from "@/server/services/workerFit";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/scheduling/worker-fit (admin) — body is the job as typed so far
 * (clientId, poolId, date, time, durationMin, repeat…). Returns every active
 * worker ranked for it: clashes, extra driving, workload, usual worker.
 * POST only because the job is a body; it saves nothing.
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, rankWorkersSchema);
  if (!body.ok) return body.response;
  return respond(await rankWorkers(auth.actor, body.data));
});
