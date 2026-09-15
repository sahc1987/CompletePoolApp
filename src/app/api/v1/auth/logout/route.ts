import { logoutSchema } from "@/contracts/auth";
import { apiNoContent, handle, readJson } from "@/server/api/respond";
import { revokeRefreshToken } from "@/server/api/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/logout
 *
 * Revoke the refresh token's whole lineage, so the device can't mint another
 * access token. The access token it already holds stays valid until it expires
 * — at most 15 minutes — which is the usual trade for not consulting a
 * revocation list on every request.
 *
 * Deliberately unauthenticated, and always 204. A client signing out may well
 * be doing so *because* its access token expired; erroring here would leave it
 * holding a live refresh token with no way to surrender it.
 */
export const POST = handle(async (req) => {
  const body = await readJson(req);
  if (body.ok) {
    const parsed = logoutSchema.safeParse(body.body);
    if (parsed.success && parsed.data.refreshToken) {
      await revokeRefreshToken(parsed.data.refreshToken);
    }
  }
  return apiNoContent();
});
