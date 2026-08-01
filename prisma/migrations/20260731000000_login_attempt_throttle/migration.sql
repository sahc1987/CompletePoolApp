-- Sign-in throttling keyed by the email typed, not by User. Keying it off the
-- user table made an unknown address report a different attempt count than a
-- real one, which answered "does this person have an account?" for any caller.
CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "email"       TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("email")
);

-- Supports the stale-row prune.
CREATE INDEX IF NOT EXISTS "LoginAttempt_updatedAt_idx" ON "LoginAttempt"("updatedAt");

-- User.failedLoginAttempts / User.lockedUntil are intentionally left in place.
-- Nothing reads them any more; dropping them would discard history for no gain.
