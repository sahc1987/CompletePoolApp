import { paymentDetailsSchema } from "@/contracts/billing";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { payBill } from "@/server/services/billing";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bills/:id/payments — admin: record a cash, check or online
 * payment, full or partial. The same `payBill` as the web: it closes any open
 * card checkout first, and refuses more than the balance.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, paymentDetailsSchema);
  if (!body.ok) return body.response;

  const result = await payBill(auth.actor, { billId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
