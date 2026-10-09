import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { toggleMaterial } from "@/server/services/materials";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/materials/:id/toggle — admin: retire a material (off every
 * picker, history kept) or bring it back. Returns { active }.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  return respond(await toggleMaterial(auth.actor, { id: params.id }));
});
