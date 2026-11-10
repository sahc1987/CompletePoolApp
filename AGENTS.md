# AGENTS.md: CompletePoolApp

Status: Complete

## Project summary
Pool-service business app for a single company: scheduling, worker tasks, materials, billing, estimates and KPIs.
Next.js 14 web app on Supabase Postgres via Prisma, plus an Expo Android app in `mobile/` for workers.
One service layer in `src/server/services/*` serves both the web and the REST API. See [PRD.md](PRD.md).

## Commands
```bash
npm install
npm run dev                  # Next dev server on :3000
npm run build                # prisma generate && next build
npx tsc --noEmit             # type check, also enforces enum parity
npm test                     # Jest (excludes mobile/)
npm run prisma:generate      # after editing prisma/schema.prisma
# lint: none; Prettier is planned (see CODE_STYLE.md)
cd mobile && npm install --legacy-peer-deps
cd mobile && npm start | npm run typecheck | npm test | npm run bundle:check
```

## Project map
- `src/server/services/*`: business rules ([ARCHITECTURE.md](ARCHITECTURE.md)).
- `src/app/*/actions.ts`, `page.tsx`: web adapters. `src/app/api/v1/**/route.ts`: REST adapters.
- `src/contracts/*`: shared Zod schemas (also `@contracts/*` in mobile).
- `src/lib/*`: guards, timezone, privileges, form helpers.
- `prisma/schema.prisma`: data model ([DATABASE.md](DATABASE.md)).
- `mobile/`: Expo app; read `mobile/README.md` and `mobile/AGENTS.md` first.

## Rules from the other docs
- Product scope and priorities: [PRD.md](PRD.md).
- Architecture: services return `ServiceResult`, adapters stay thin, mobile does no date arithmetic ([ARCHITECTURE.md](ARCHITECTURE.md)).
- Database: production only; `prisma migrate deploy`, never `migrate dev`; ask before any write ([DATABASE.md](DATABASE.md)).
- Security: re-check auth with `assertRole` in every service; other workers' resources return 404; never log secrets or PII ([SECURITY.md](SECURITY.md)).
- Design: use tokens from `tailwind.config.ts`, WCAG 2.2 AA, light theme ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).
- Style: TS strict, conventional commits, commit to master ([CODE_STYLE.md](CODE_STYLE.md)).
- Testing: Jest with mocked Prisma, 80% coverage target ([TESTING.md](TESTING.md)).

## Do / Don't
Do:
- Add new REST endpoints as thin adapters over an existing service.
- Add new enum values in both the Prisma schema and `src/contracts/enums.ts`.
- Use `src/lib/timezone.ts` and the business timezone from `AppSettings`.
- Use `requireReader` for new reads (public demo login is read-only).
- Run `npm run bundle:check` when mobile imports change.

Don't:
- Don't run migrations, seeds or writes against the live database without asking.
- Don't import `@prisma/client` or `next` in `src/contracts/*`.
- Don't reimplement stock decrement, the privilege ladder, the last-manager guard, or calendar price hiding.
- Don't put tokens in AsyncStorage, set `disableHierarchicalLookup`, add a `babel.config.js` to mobile, or install zod 4.
- Don't leave Playwright screenshots behind.

## Definition of done for any change
- `npx tsc --noEmit` and `npm test` pass (plus mobile checks if `mobile/` changed).
- Tests added or updated, including the denied path for new services.
- Docs updated if behavior, schema or conventions changed.
- Committed to master with a conventional commit message.
