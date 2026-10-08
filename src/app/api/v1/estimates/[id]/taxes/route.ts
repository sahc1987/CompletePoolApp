import { addTaxSchema } from "@/contracts/estimates";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { addTax } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/** POST /api/v1/estimates/:id/taxes — body { taxRateId }. Drafts only. */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, addTaxSchema.omit({ estimateId: true }));
  if (!body.ok) return body.response;

  const result = await addTax(auth.actor, { estimateId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
