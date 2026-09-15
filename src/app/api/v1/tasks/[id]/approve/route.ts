import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, serviceError } from "@/server/api/respond";
import { approveTask } from "@/server/services/review";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/approve
 *
 * Approving a submitted job marks it billable and raises its bill. Only a
 * SUBMITTED job can be approved.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await approveTask(auth.actor, { taskId: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
