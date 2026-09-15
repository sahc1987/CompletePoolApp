-- Native-client authentication. The web app signs in with a NextAuth cookie;
-- the mobile app can't, so it holds a short-lived access token plus a
-- long-lived refresh token recorded here.

CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id"        TEXT NOT NULL,
    -- SHA-256 of the token. The token itself is never stored, so a read of
    -- this table yields nothing usable.
    "tokenHash" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    -- Rotation lineage. Presenting an already-rotated token means two clients
    -- hold the family, so the whole family is revoked at once.
    "familyId"  TEXT NOT NULL,
    "issuedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- Deleting a user takes their sessions with them. Every other relation to User
-- is deliberately restrictive (history must survive a departure), but a live
-- credential is not history.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_userId_fkey'
  ) THEN
    ALTER TABLE "RefreshToken"
      ADD CONSTRAINT "RefreshToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Fixed-window request throttle for the API's auth endpoints. A table rather
-- than an in-process counter because the app runs as serverless functions,
-- where an in-memory map is per-instance and therefore not a limit at all.
CREATE TABLE IF NOT EXISTS "ApiRateLimit" (
    "key"         TEXT NOT NULL,
    "count"       INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "ApiRateLimit_updatedAt_idx" ON "ApiRateLimit"("updatedAt");

-- Both tables are reached only by the app's own pooled connection. Neither
-- should ever be readable through Supabase's PostgREST API — one holds session
-- credentials, the other is throttle state that an attacker would like to
-- clear. RLS with no policies denies the anon/authenticated roles outright;
-- the app connects as the table owner, which is exempt.
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiRateLimit" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "RefreshToken" FROM anon;
    REVOKE ALL ON TABLE "ApiRateLimit" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "RefreshToken" FROM authenticated;
    REVOKE ALL ON TABLE "ApiRateLimit" FROM authenticated;
  END IF;
END
$$;
