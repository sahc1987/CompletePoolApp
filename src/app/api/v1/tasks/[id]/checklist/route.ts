import { saveTaskChecklistSchema } from "@/contracts/checklist";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { saveTaskChecklist } from "@/server/services/checklists";

export const dynamic = "force-dynamic";

/**
 * PUT /api/v1/tasks/:id/checklist — a worker saves which checklist items are
 * ticked on their job. Body: { done: string[] } (ids). PUT, not POST: it
 * replaces the ticks, so the app can resend it after a dropped connection.
 * Someone else's job answers 404.
 */
export const PUT = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, saveTaskChecklistSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  const result = await saveTaskChecklist(auth.actor, { taskId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
