import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { toggleUserActive } from "@/server/services/users";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/users/:id/toggle-active — admin and owner: disable (signing out
 * every device) or re-enable. Never yourself or the last active manager.
 * Returns { active }.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"], fresh: true });
  if (!auth.ok) return auth.response;

  return respond(await toggleUserActive(auth.actor, { userId: params.id }));
});
