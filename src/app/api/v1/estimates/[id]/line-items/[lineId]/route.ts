import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, serviceError } from "@/server/api/respond";
import { deleteLineItem } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/estimates/:id/line-items/:lineId — drafts only. */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deleteLineItem(auth.actor, {
    estimateId: params.id,
    id: params.lineId,
  });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
