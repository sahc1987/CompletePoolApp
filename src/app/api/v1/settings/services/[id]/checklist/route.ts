import { serviceChecklistSchema } from "@/contracts/checklist";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { saveServiceChecklist } from "@/server/services/checklists";

export const dynamic = "force-dynamic";

/**
 * PUT /api/v1/settings/services/:id/checklist — admin. Replaces the service's
 * whole checklist: { items: string[] } in order. Jobs already in progress keep
 * their own ticks.
 */
export const PUT = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, serviceChecklistSchema.omit({ serviceId: true }));
  if (!body.ok) return body.response;

  return respond(await saveServiceChecklist(auth.actor, { serviceId: params.id, ...body.data }));
});
