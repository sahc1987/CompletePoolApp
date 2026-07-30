-- Business timezone. Eastern by default, matching how the app behaved on a
-- developer machine before times were pinned to an explicit zone.
ALTER TABLE "AppSettings" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York';
