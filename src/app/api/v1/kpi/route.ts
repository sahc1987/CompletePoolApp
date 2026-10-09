import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { getKpiSummary } from "@/server/services/kpi";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/kpi — owner only, as on the web: revenue, margin, on-time rate,
 * signed estimates, and per-worker and per-material figures, as plain numbers.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["OWNER"] });
  if (!auth.ok) return auth.response;

  return respond(await getKpiSummary(auth.actor));
});
