import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { toggleTaxRate } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/settings/tax-rates/:id/toggle — admin: take a rate off new
 * estimates (it's never deleted) or bring it back. Returns { active }.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  return respond(await toggleTaxRate(auth.actor, { id: params.id }));
});
