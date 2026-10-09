import { reverseBillSchema } from "@/contracts/billing";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { reverseBillPayments } from "@/server/services/billing";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bills/:id/reverse { reason } — admin: undo every payment on
 * the bill, keeping a record of what was reversed, by whom, and why.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, reverseBillSchema.omit({ billId: true }));
  if (!body.ok) return body.response;

  const result = await reverseBillPayments(auth.actor, { billId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
