import { adjustStockSchema } from "@/contracts/materials";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { adjustStock } from "@/server/services/materials";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/materials/:id/stock { type, quantity, note? } — admin. RESTOCK
 * always adds; ADJUSTMENT may be negative (a recount, damage). Every change is
 * logged as a stock movement.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, adjustStockSchema.omit({ materialId: true }));
  if (!body.ok) return body.response;

  const result = await adjustStock(auth.actor, { materialId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
