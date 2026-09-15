import { changePasswordSchema } from "@/contracts/account";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { revokeAllForUser } from "@/server/api/tokens";
import { changePassword } from "@/server/services/account";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/me/password
 *
 * Change your own password. The current one is required, so this is safe for
 * anyone signed in regardless of role.
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, changePasswordSchema);
  if (!body.ok) return body.response;

  const result = await changePassword(auth.actor, body.data);
  if (!result.ok) return serviceError(result);

  // Changing a password means "whoever had access should not any more" — most
  // often because they suspect someone did. Leaving other devices holding a
  // 30-day refresh token would make the change cosmetic on every phone but
  // this one, so every session is revoked.
  //
  // That includes the caller's own refresh token: the client must sign in
  // again with the new password, which is also the simplest way for it to
  // confirm the change took.
  await revokeAllForUser(auth.actor.id);

  return apiNoContent();
});
