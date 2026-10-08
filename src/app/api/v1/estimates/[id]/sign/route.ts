import { signEstimateSchema } from "@/contracts/estimates";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { signEstimate } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/:id/sign
 *
 * Body: { signedByName, signatureData } — signatureData is a
 * "data:image/png;base64,..." URL from the signature pad, the same format the
 * web pad produces.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, signEstimateSchema.omit({ estimateId: true }));
  if (!body.ok) return body.response;

  const result = await signEstimate(auth.actor, { estimateId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
