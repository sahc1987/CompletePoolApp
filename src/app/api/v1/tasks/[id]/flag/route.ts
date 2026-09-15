import { flagTaskSchema } from "@/contracts/review";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { flagTask } from "@/server/services/review";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/flag
 *
 * Body: { reason } — required, since the whole point is telling the worker
 * what to fix.
 *
 * Flagging deliberately does not reverse material usage: the material was
 * still physically used, only the billing or pricing was wrong.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, flagTaskSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  const result = await flagTask(auth.actor, {
    taskId: params.id,
    reason: body.data.reason,
  });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
