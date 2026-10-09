import { getBusinessTimezone } from "@/lib/schedule";
import { requireApi } from "@/server/api/auth";
import { apiError, apiOk, handle, serviceError } from "@/server/api/respond";
import { getBill } from "@/server/services/billingReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/bills/:id — admin and owner: the bill with its line items, tax,
 * payments (each with the balance left after it) and any undo history, plus
 * the business's `timezone` so the app shows dates as the business counts them.
 */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  const [result, timezone] = await Promise.all([
    getBill(auth.actor, params.id),
    getBusinessTimezone(),
  ]);
  if (!result.ok) return serviceError(result);
  if (!result.data) return apiError("NOT_FOUND", "Bill not found.");
  return apiOk({ ...result.data, timezone });
});
