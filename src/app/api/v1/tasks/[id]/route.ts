import { editTaskSchema } from "@/contracts/scheduling";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { editTask } from "@/server/services/scheduling";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/tasks/:id
 *
 * Admin: edit or reschedule a job — worker, service, date, time, duration,
 * price, and `applyToSeries` for a repeating job. The same `editTask` as the
 * web calendar's edit window: hours and double-booking are re-checked, and a
 * finished or cancelled job is refused (422).
 */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, editTaskSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  const result = await editTask(auth.actor, { taskId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
