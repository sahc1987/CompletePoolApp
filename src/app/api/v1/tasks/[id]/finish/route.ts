import { finishTaskSchema } from "@/contracts/scheduling";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { finishTask } from "@/server/services/scheduling";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/finish
 *
 * An admin closing out a job themselves, bypassing the worker-submit then
 * review path. Marks it approved and raises the bill.
 *
 * Body: { usage } — materials logged on the way out. If the worker already
 * submitted the job, its usage is on record and this will not count it again.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, finishTaskSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  const result = await finishTask(auth.actor, {
    taskId: params.id,
    usage: body.data.usage,
  });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
