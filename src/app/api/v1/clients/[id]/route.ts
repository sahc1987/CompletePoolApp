import { clientFieldsSchema } from "@/contracts/clients";
import { requireApi } from "@/server/api/auth";
import {
  apiError,
  apiNoContent,
  apiOk,
  handle,
  parseBody,
  serviceError,
} from "@/server/api/respond";
import { deleteClient, updateClient } from "@/server/services/clients";
import { getClient } from "@/server/services/clientReads";

export const dynamic = "force-dynamic";

/** GET /api/v1/clients/:id — admin: the client with its pools. */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  const result = await getClient(auth.actor, params.id);
  if (!result.ok) return serviceError(result);
  if (!result.data) return apiError("NOT_FOUND", "Client not found.");
  return apiOk(result.data);
});

/** PATCH /api/v1/clients/:id — admin: replace the client's details. */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, clientFieldsSchema);
  if (!body.ok) return body.response;

  const result = await updateClient(auth.actor, { id: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});

/**
 * DELETE /api/v1/clients/:id — admin. Refused (409) once the client has any
 * job or estimate on record; their pools go with them.
 */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deleteClient(auth.actor, { id: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
