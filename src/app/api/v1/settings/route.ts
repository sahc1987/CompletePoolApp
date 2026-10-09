import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { getBusinessCatalog } from "@/server/services/catalogReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/settings — admin: business hours and timezone, and the catalog
 * of services, add-ons and tax rates (active and inactive).
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  return respond(await getBusinessCatalog(auth.actor));
});
