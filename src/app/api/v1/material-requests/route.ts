import { createMaterialRequestSchema } from "@/contracts/worker";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { createMaterialRequest } from "@/server/services/worker";
import { listMyMaterialRequests } from "@/server/services/materialReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/material-requests
 *
 * The signed-in worker's own recent requests, newest first, with the admin's
 * answer once there is one.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["WORKER"] });
  if (!auth.ok) return auth.response;

  return respond(await listMyMaterialRequests(auth.actor, { take: 20 }));
});

/**
 * POST /api/v1/material-requests
 *
 * Body: { materialId? | description?, quantityRequested, taskId?, urgent? }.
 * A request never changes stock — that only happens when an admin restocks.
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, createMaterialRequestSchema);
  if (!body.ok) return body.response;

  return respond(await createMaterialRequest(auth.actor, body.data), 201);
});
