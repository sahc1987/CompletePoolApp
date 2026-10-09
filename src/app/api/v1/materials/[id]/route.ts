import { materialFieldsSchema } from "@/contracts/materials";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { saveMaterial } from "@/server/services/materials";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/materials/:id — admin: name, unit, prices, reorder threshold. Never stock. */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, materialFieldsSchema);
  if (!body.ok) return body.response;

  const result = await saveMaterial(auth.actor, { id: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
