-- Cached map position of each pool, for the calendar's day map. Nullable and
-- filled in lazily (the first time a pool's job is mapped), so existing rows
-- need no backfill.
ALTER TABLE "Pool" ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
