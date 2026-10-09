import { taxRateFieldsSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { saveTaxRate } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/settings/tax-rates/:id — admin. Signed estimates keep the rate they were signed at. */
export const PATCH = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, taxRateFieldsSchema);
  if (!body.ok) return body.response;

  const result = await saveTaxRate(auth.actor, { id: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
