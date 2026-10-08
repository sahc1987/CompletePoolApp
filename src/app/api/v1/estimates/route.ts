import { createEstimateSchema } from "@/contracts/estimates";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { createEstimate } from "@/server/services/estimates";
import { listEstimates } from "@/server/services/estimateReads";

export const dynamic = "force-dynamic";

/** GET /api/v1/estimates — every estimate, newest first. Staff only. */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"] });
  if (!auth.ok) return auth.response;

  return respond(await listEstimates(auth.actor));
});

/**
 * POST /api/v1/estimates
 *
 * Starts a draft for an existing client (mode "existing", clientId, poolId?)
 * or one captured on the spot (mode "new", newName, newPhone?, ...).
 * Returns { id, createdClient }.
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, createEstimateSchema);
  if (!body.ok) return body.response;

  return respond(await createEstimate(auth.actor, body.data), 201);
});
