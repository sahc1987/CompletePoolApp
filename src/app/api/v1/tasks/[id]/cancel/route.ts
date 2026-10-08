import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, serviceError } from "@/server/api/respond";
import { cancelTask } from "@/server/services/scheduling";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/cancel
 *
 * Calls off a job that hasn't been finished. Material its worker already
 * logged goes back into stock. A finished (billed) job is refused with 422.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await cancelTask(auth.actor, { taskId: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
