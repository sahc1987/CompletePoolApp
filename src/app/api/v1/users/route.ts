import { createUserSchema } from "@/contracts/users";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { createUser } from "@/server/services/users";
import { listTeam } from "@/server/services/userReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/users — admin and owner: the team, each row already marked with
 * what the caller may do to it (`locked`, `administrable`, `isLastManager`),
 * plus the roles the caller may grant.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  return respond(await listTeam(auth.actor));
});

/**
 * POST /api/v1/users { name, email, phone?, role, password } — admin and owner.
 * Never above the caller's own rank. Returns { id }.
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, createUserSchema);
  if (!body.ok) return body.response;

  return respond(await createUser(auth.actor, body.data), 201);
});
