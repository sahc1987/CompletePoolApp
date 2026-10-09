import { serviceFieldsSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { saveService } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** POST /api/v1/settings/services { name, basePrice, defaultDurationMin } — admin. Returns { id }. */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, serviceFieldsSchema);
  if (!body.ok) return body.response;

  return respond(await saveService(auth.actor, body.data), 201);
});
