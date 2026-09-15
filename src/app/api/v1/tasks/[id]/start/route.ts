import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, serviceError } from "@/server/api/respond";
import { startTask } from "@/server/services/worker";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/start
 *
 * A worker begins a job, or restarts one flagged back to them for rework. The
 * service confirms it is theirs — a job belonging to someone else comes back
 * 404, not 403, because a worker has no business learning which ids exist.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await startTask(auth.actor, { taskId: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
