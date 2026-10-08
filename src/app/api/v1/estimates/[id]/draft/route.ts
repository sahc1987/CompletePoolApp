import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, serviceError } from "@/server/api/respond";
import { backToDraft } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/** POST /api/v1/estimates/:id/draft — reopen a presented estimate for editing. */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await backToDraft(auth.actor, { estimateId: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
