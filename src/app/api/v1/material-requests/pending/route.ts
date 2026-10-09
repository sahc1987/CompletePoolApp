import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { listPendingMaterialRequests } from "@/server/services/materialReads";

export const dynamic = "force-dynamic";

/** GET /api/v1/material-requests/pending — admin inbox: urgent first, then oldest. */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  return respond(await listPendingMaterialRequests(auth.actor));
});
