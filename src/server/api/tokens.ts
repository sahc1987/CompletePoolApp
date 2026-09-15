import { createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Token minting and verification for native clients.
 *
 * The web app's session is a NextAuth cookie and stays exactly as it was. A
 * phone gets a short-lived access token it sends as a bearer, plus a long-lived
 * refresh token it exchanges for the next one. Nothing here touches the cookie
 * path.
 */

/** How long a bearer token is honoured before the client must refresh. */
export const ACCESS_TOKEN_TTL_S = 15 * 60;

/**
 * How long a device may go without signing in again. A crew member who works a
 * route every week is never prompted; a phone left in a drawer for a month is.
 */
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;

const ISSUER = "completepoolapp";
const AUDIENCE = "completepoolapp/api/v1";

/**
 * The signing key, derived from NEXTAUTH_SECRET rather than read from a new
 * variable of its own.
 *
 * A second required env var is a second thing to forget on a deploy, and the
 * failure mode — every mobile client silently unable to sign in — is one nobody
 * notices from the web app. HKDF with a fixed `info` label gives a key that is
 * cryptographically independent of the one NextAuth derives for its cookie, so
 * a token from one context can never verify in the other; changing the label
 * invalidates every outstanding access token, which is the intended lever if
 * one ever needs to be forced.
 */
let cachedKey: Uint8Array | null = null;

function signingKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Refusing here is deliberate: falling back to a default would mean anyone
    // who read this file could mint a valid token for any account.
    throw new Error(
      "NEXTAUTH_SECRET is not set — the API cannot sign access tokens."
    );
  }

  cachedKey = new Uint8Array(
    hkdfSync("sha256", secret, "", "completepoolapp/api/access-token/v1", 32)
  );
  return cachedKey;
}

export type AccessTokenClaims = {
  userId: string;
  role: Role;
};

export async function signAccessToken(
  claims: AccessTokenClaims
): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_S}s`)
    .sign(signingKey());
}

/**
 * Verify a bearer token. Returns null for anything wrong with it — expired,
 * re-signed, issued for another audience, malformed — because a caller has no
 * use for the distinction and an error message that draws one is a gift to
 * whoever is probing.
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      (role !== "OWNER" && role !== "ADMIN" && role !== "WORKER")
    ) {
      return null;
    }
    return { userId: payload.sub, role };
  } catch {
    return null;
  }
}

// --- Refresh tokens --------------------------------------------------------

/** 256 bits of CSPRNG output, url-safe so it survives any transport. */
function mintSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What gets stored. Plain SHA-256, not bcrypt: the input is already 256 bits of
 * randomness, so there is no low-entropy guess to slow an attacker down to, and
 * bcrypt would silently truncate at 72 bytes.
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time compare, so a lookup never leaks a hash by timing. */
function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, for the client's own timer. */
  expiresIn: number;
};

/**
 * Start a new session. `familyId` is the rotation lineage — omit it to begin a
 * fresh one at sign-in, pass the previous token's to continue it on refresh.
 */
export async function issueTokens(
  user: { id: string; role: Role },
  opts: { familyId?: string; userAgent?: string | null } = {}
): Promise<IssuedTokens> {
  const raw = mintSecret();
  const familyId = opts.familyId ?? randomBytes(16).toString("hex");

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId: user.id,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_S * 1000),
      userAgent: opts.userAgent ?? null,
    },
  });

  return {
    accessToken: await signAccessToken({ userId: user.id, role: user.role }),
    refreshToken: raw,
    expiresIn: ACCESS_TOKEN_TTL_S,
  };
}

export type RefreshOutcome =
  | { ok: true; tokens: IssuedTokens }
  /** Unknown, expired, or revoked. The client must sign in again. */
  | { ok: false; reason: "invalid" }
  /** The account behind it is disabled or gone. */
  | { ok: false; reason: "revoked" }
  /**
   * An already-rotated token was presented — two parties hold this lineage, so
   * it is treated as theft and the whole family is killed.
   */
  | { ok: false; reason: "reused" };

/**
 * Exchange a refresh token for a fresh pair, rotating it.
 *
 * Rotation is what makes a stolen refresh token detectable: whichever party
 * uses it second presents a token already marked used, and that is the signal
 * to revoke the family. The legitimate client is signed out too, which is the
 * correct trade — one forced sign-in beats an attacker holding a month-long
 * credential.
 */
export async function rotateRefreshToken(
  raw: string,
  opts: { userAgent?: string | null } = {}
): Promise<RefreshOutcome> {
  if (!raw) return { ok: false, reason: "invalid" };

  const presented = hashToken(raw);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: presented },
    include: { user: { select: { id: true, role: true, active: true } } },
  });

  if (!existing || !hashesEqual(existing.tokenHash, presented)) {
    return { ok: false, reason: "invalid" };
  }

  if (existing.usedAt) {
    // Replay. Kill every token in the lineage, including the one the honest
    // client is holding — we cannot tell which party is which.
    await revokeFamily(existing.familyId);
    return { ok: false, reason: "reused" };
  }

  if (existing.revokedAt || existing.expiresAt <= new Date()) {
    return { ok: false, reason: "invalid" };
  }

  // The role is re-read here rather than carried forward from the old token:
  // this is the moment a demotion or a deactivation takes effect on a device.
  if (!existing.user.active) {
    await revokeAllForUser(existing.user.id);
    return { ok: false, reason: "revoked" };
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { usedAt: new Date() },
  });

  const tokens = await issueTokens(
    { id: existing.user.id, role: existing.user.role },
    { familyId: existing.familyId, userAgent: opts.userAgent }
  );
  return { ok: true, tokens };
}

/** Sign out one device: revoke the token it holds and its lineage. */
export async function revokeRefreshToken(raw: string): Promise<void> {
  if (!raw) return;
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { familyId: true },
  });
  if (row) await revokeFamily(row.familyId);
}

export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Sign a user out everywhere. Called when an account is disabled and when its
 * password is reset — both mean "the person who had access should not any
 * more", and a 30-day refresh token would otherwise outlive the decision.
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Drop rows that can no longer authenticate anything. Called opportunistically
 * from the refresh path, the same way the login throttle prunes itself.
 */
export async function pruneExpiredRefreshTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
}
