-- Enable row level security on every table in `public`.
--
-- Only _prisma_migrations, RefreshToken and ApiRateLimit had it. Supabase's
-- PostgREST exposes `public` to the anon/authenticated roles, so a table
-- without RLS is readable by anyone holding the project's anon key.
--
-- No policies are added, which denies those roles everything. The app connects
-- through Prisma as the table owner, which is exempt from RLS. Deliberately NOT
-- FORCE ROW LEVEL SECURITY, which would lock the owner out too.
-- Idempotent: enabling RLS on a table that already has it is a no-op.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE "public".%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
