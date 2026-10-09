import { respondMaterialRequestSchema } from "@/contracts/materials";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { respondMaterialRequest } from "@/server/services/materials";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/material-requests/:id/respond { decision: APPROVED|DENIED, note? }
 * — admin. The worker is notified. Approving doesn't touch stock; a restock
 * does, once the material actually arrives.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, respondMaterialRequestSchema.omit({ requestId: true }));
  if (!body.ok) return body.response;

  const result = await respondMaterialRequest(auth.actor, { requestId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
