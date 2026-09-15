import { loginSchema } from "@/contracts/auth";
import { clientIp } from "@/lib/loginThrottle";
import { verifyCredentials } from "@/server/services/auth";
import { LOGIN_RULE, rateLimit } from "@/server/api/rateLimit";
import { apiError, apiOk, handle, readJson } from "@/server/api/respond";
import { issueTokens } from "@/server/api/tokens";

// Never cached, never prerendered: this reads request headers and writes rows.
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/login
 *
 * Exchange an email and password for an access/refresh pair. The credential
 * check is the same function NextAuth's provider calls, so the web and the app
 * throttle and fail identically.
 */
export const POST = handle(async (req) => {
  // Requests are capped before bcrypt runs; the per-address and per-source
  // *failure* lockouts inside verifyCredentials are still the real limit on
  // guessing a password.
  const limited = await rateLimit(req, "auth/login", LOGIN_RULE);
  if (!limited.ok) return limited.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = loginSchema.safeParse(body.body);
  if (!parsed.success) {
    return apiError("VALIDATION", parsed.error.errors[0].message);
  }

  const user = await verifyCredentials({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: clientIp(req.headers),
  });

  if (!user) {
    // One message for a bad password, an unknown address, a disabled account
    // and a throttled attempt. Saying which would answer "does this person
    // work here?" for anyone who asked.
    return apiError("UNAUTHENTICATED", "That email or password isn't right.");
  }

  const tokens = await issueTokens(user, {
    userAgent: req.headers.get("user-agent"),
  });

  return apiOk({
    ...tokens,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  });
});
