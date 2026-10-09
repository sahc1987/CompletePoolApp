import { serviceFieldsSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { deleteService, saveService } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/settings/services/:id — admin. Existing jobs keep their price. */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, serviceFieldsSchema);
  if (!body.ok) return body.response;

  const result = await saveService(auth.actor, { id: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});

/** DELETE /api/v1/settings/services/:id — admin. Refused (409) once any job uses it. */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deleteService(auth.actor, { id: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
