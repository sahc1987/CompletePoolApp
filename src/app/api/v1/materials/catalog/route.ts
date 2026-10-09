import { materialFieldsSchema } from "@/contracts/materials";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { saveMaterial } from "@/server/services/materials";
import { listMaterials } from "@/server/services/materialReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/materials/catalog — admin: every material, active and retired,
 * with prices, stock on hand and a `low` flag at the reorder threshold.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  return respond(await listMaterials(auth.actor));
});

/**
 * POST /api/v1/materials/catalog — admin: add a material. It starts with no
 * stock; stock only moves through logged movements (POST …/:id/stock).
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, materialFieldsSchema);
  if (!body.ok) return body.response;

  return respond(await saveMaterial(auth.actor, body.data), 201);
});
