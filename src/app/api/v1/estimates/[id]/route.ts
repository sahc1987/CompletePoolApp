import { requireApi } from "@/server/api/auth";
import {
  apiError,
  apiNoContent,
  apiOk,
  handle,
  serviceError,
} from "@/server/api/respond";
import { deleteEstimate } from "@/server/services/estimates";
import { getEstimate } from "@/server/services/estimateReads";

export const dynamic = "force-dynamic";

/** GET /api/v1/estimates/:id — the estimate with its lines, taxes and totals. */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"] });
  if (!auth.ok) return auth.response;

  const result = await getEstimate(auth.actor, params.id);
  if (!result.ok) return serviceError(result);
  if (!result.data) return apiError("NOT_FOUND", "Estimate not found.");
  return apiOk(result.data);
});

/** DELETE /api/v1/estimates/:id — drafts only. */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deleteEstimate(auth.actor, { estimateId: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
