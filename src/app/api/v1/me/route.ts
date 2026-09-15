import { requireApi } from "@/server/api/auth";
import { apiError, handle, parseBody, respond } from "@/server/api/respond";
import { getMyProfile, updateProfile } from "@/server/services/account";
import { updateProfileSchema } from "@/contracts/account";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/me
 *
 * The signed-in user. Read fresh rather than reconstructed from the token's
 * claims — this is the call a client makes on launch to find out whether its
 * stored session is still any good, so answering from the token it just sent
 * would defeat the purpose.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { fresh: true });
  if (!auth.ok) return auth.response;

  const result = await getMyProfile(auth.actor);
  if (!result.ok) return respond(result);
  if (!result.data) {
    // Deleted between the token check and this read.
    return apiError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return respond({ ok: true, data: result.data });
});

/**
 * PATCH /api/v1/me
 *
 * Update your own name and phone. There is no role check because the row is
 * identified by the actor, never by the body — you cannot address anyone else.
 */
export const PATCH = handle(async (req) => {
  const auth = await requireApi(req, { fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, updateProfileSchema);
  if (!body.ok) return body.response;

  const result = await updateProfile(auth.actor, body.data);
  if (!result.ok) return respond(result);

  // Hand back the saved profile, so a client doesn't need a second round trip
  // to render what it just changed.
  return respond(await getMyProfile(auth.actor));
});
