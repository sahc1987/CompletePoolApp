import { taxRateFieldsSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { saveTaxRate } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** POST /api/v1/settings/tax-rates { name, rate } — admin. `rate` is a percent. Returns { id }. */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, taxRateFieldsSchema);
  if (!body.ok) return body.response;

  return respond(await saveTaxRate(auth.actor, body.data), 201);
});
