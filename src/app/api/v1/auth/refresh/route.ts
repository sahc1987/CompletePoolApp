import { refreshSchema } from "@/contracts/auth";
import { REFRESH_RULE, rateLimit } from "@/server/api/rateLimit";
import { apiError, apiOk, handle, readJson } from "@/server/api/respond";
import {
  pruneExpiredRefreshTokens,
  rotateRefreshToken,
} from "@/server/api/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/refresh
 *
 * Exchange a refresh token for a new pair. The presented token is rotated — it
 * will not work a second time — which is what makes a stolen one detectable:
 * whoever uses it second trips the reuse check and the whole lineage is
 * revoked.
 */
export const POST = handle(async (req) => {
  // Refresh never runs bcrypt, but it is an unauthenticated endpoint that
  // writes rows, so it gets its own ceiling.
  const limited = await rateLimit(req, "auth/refresh", REFRESH_RULE);
  if (!limited.ok) return limited.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = refreshSchema.safeParse(body.body);
  if (!parsed.success) {
    return apiError("VALIDATION", parsed.error.errors[0].message);
  }

  const result = await rotateRefreshToken(parsed.data.refreshToken, {
    userAgent: req.headers.get("user-agent"),
  });

  if (!result.ok) {
    // Every failure reads the same to the client, and the action it should
    // take is the same too: drop the tokens and show the sign-in screen. The
    // reuse case has already revoked the family server-side.
    return apiError("UNAUTHENTICATED", "Your session expired. Sign in again.");
  }

  // Cheap, and only on a path that already writes.
  await pruneExpiredRefreshTokens();

  return apiOk(result.tokens);
});
