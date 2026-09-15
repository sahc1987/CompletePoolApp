import { submitTaskSchema } from "@/contracts/worker";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { submitTask } from "@/server/services/worker";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/submit
 *
 * Body: { usage: [{ materialId, qty }] } — only what was actually used. An
 * omitted material is not a zero quantity; it simply wasn't used.
 *
 * Stock decrements here, exactly once per job: a job submitted, flagged and
 * re-submitted does not take the material off the shelf twice.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  // The id comes from the path, so a body that disagrees can't redirect the
  // write to another job.
  const body = await parseBody(req, submitTaskSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  const result = await submitTask(auth.actor, {
    taskId: params.id,
    usage: body.data.usage,
  });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
