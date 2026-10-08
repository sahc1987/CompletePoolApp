import { declineEstimateSchema } from "@/contracts/estimates";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { declineEstimate } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/** POST /api/v1/estimates/:id/decline — body { declineReason? }. */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, declineEstimateSchema.omit({ estimateId: true }));
  if (!body.ok) return body.response;

  const result = await declineEstimate(auth.actor, {
    estimateId: params.id,
    ...body.data,
  });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
