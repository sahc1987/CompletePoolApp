import { extraFieldsSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { deleteExtra, saveExtra } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/settings/extras/:id — admin. */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, extraFieldsSchema);
  if (!body.ok) return body.response;

  const result = await saveExtra(auth.actor, { id: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});

/** DELETE /api/v1/settings/extras/:id — admin. Refused (409) once any job used it. */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deleteExtra(auth.actor, { id: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
