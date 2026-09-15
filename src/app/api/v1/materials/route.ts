import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { listUsableMaterials } from "@/server/services/materialReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/materials
 *
 * The materials that can go on new work, for the usage form a worker fills in
 * when submitting a job. Retired materials are excluded — they can't be used
 * going forward, though jobs that already consumed them keep their history.
 *
 * Open to any signed-in user: a worker picks from this to log usage, and an
 * admin picks from the same list when finishing a job. It carries names and
 * units only, never cost or customer price.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  return respond(await listUsableMaterials(auth.actor));
});
