import { requireApi } from "@/server/api/auth";
import { apiOk, handle, serviceError } from "@/server/api/respond";
import {
  getLineItemCatalog,
  listEstimateClients,
} from "@/server/services/estimateReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/estimates/catalog
 *
 * What the estimate builder picks from: clients with their pools, and
 * line-item suggestions (services, add-ons, materials) at customer prices.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"] });
  if (!auth.ok) return auth.response;

  const [clients, lineItems] = await Promise.all([
    listEstimateClients(auth.actor),
    getLineItemCatalog(auth.actor),
  ]);
  if (!clients.ok) return serviceError(clients);
  if (!lineItems.ok) return serviceError(lineItems);
  return apiOk({ clients: clients.data, lineItems: lineItems.data });
});
