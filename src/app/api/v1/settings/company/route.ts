import { companyInfoSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { saveCompanyInfo } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/**
 * PUT /api/v1/settings/company — admin: the business identity printed on
 * invoices and receipts. Only `name` is required; blanks are left off the
 * documents. Read it back from GET /api/v1/settings (`company`).
 */
export const PUT = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, companyInfoSchema);
  if (!body.ok) return body.response;

  const result = await saveCompanyInfo(auth.actor, body.data);
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
