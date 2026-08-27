-- Supabase's linter flags every table in `public` that PostgREST can reach but
-- that has no row level security. Prisma's own bookkeeping table is one of
-- them: it is created by the migration engine, so it never picks up the
-- hardening the app tables get.
--
-- Nothing outside the migration engine should read it. Enabling RLS with zero
-- policies denies the anon/authenticated API roles; the migration engine
-- connects as the table owner, which is exempt, so migrations keep working.
-- Deliberately NOT `FORCE ROW LEVEL SECURITY` — forcing it applies to the
-- owner too and would lock Prisma out of its own migration log.
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Belt to those suspenders, and only where Supabase's API roles exist (they do
-- not on a plain local Postgres, where this migration must still apply).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "public"."_prisma_migrations" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "public"."_prisma_migrations" FROM authenticated;
  END IF;
END
$$;
