import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { getSchedulingCatalog } from "@/server/services/catalogReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/scheduling/catalog
 *
 * Admin: everything the new-job and edit-job forms pick from — clients with
 * their pools, active workers, services, add-ons and business hours.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  return respond(await getSchedulingCatalog(auth.actor));
});
