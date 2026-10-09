import { extraFieldsSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { saveExtra } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** POST /api/v1/settings/extras { name, price } — admin: a new add-on. Returns { id }. */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, extraFieldsSchema);
  if (!body.ok) return body.response;

  return respond(await saveExtra(auth.actor, body.data), 201);
});
