import { poolFieldsSchema } from "@/contracts/clients";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { createPool } from "@/server/services/clients";

export const dynamic = "force-dynamic";

/** POST /api/v1/clients/:id/pools — admin: add a service address. Returns { id }. */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, poolFieldsSchema);
  if (!body.ok) return body.response;

  return respond(await createPool(auth.actor, { clientId: params.id, ...body.data }), 201);
});
