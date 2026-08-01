-- Per-source sign-in throttling. The per-email counter can't detect password
-- spraying: one password tried against every employee address leaves each
-- account sitting on a single failure, well under its own lock threshold.
CREATE TABLE IF NOT EXISTS "LoginSource" (
    "ip"          TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginSource_pkey" PRIMARY KEY ("ip")
);

CREATE INDEX IF NOT EXISTS "LoginSource_updatedAt_idx" ON "LoginSource"("updatedAt");
