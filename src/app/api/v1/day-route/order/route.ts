import { routeOrderSchema } from "@/contracts/routePlan";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { applyRouteOrder } from "@/server/services/routePlanning";

export const dynamic = "force-dynamic";

/**
 * PUT /api/v1/day-route/order (admin) — body { day, workerId, taskIds }. Gives
 * the worker's day the same time slots in the new visit order. PUT, so a retry
 * after a dropped connection just applies the same order again.
 */
export const PUT = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, routeOrderSchema);
  if (!body.ok) return body.response;

  const result = await applyRouteOrder(auth.actor, body.data);
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
