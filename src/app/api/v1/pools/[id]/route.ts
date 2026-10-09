import { poolFieldsSchema } from "@/contracts/clients";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { deletePool, updatePool } from "@/server/services/clients";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/pools/:id — admin: address, size, type. A new address clears
 * the cached map position so the day map looks it up again.
 */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, poolFieldsSchema);
  if (!body.ok) return body.response;

  const result = await updatePool(auth.actor, { id: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});

/** DELETE /api/v1/pools/:id — admin. Refused (409) once a job used the pool. */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deletePool(auth.actor, { id: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
