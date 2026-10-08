# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Pool-service business app: a Next.js 14 web app (scheduling, worker tasks, materials, billing, estimates, KPIs) on Supabase Postgres via Prisma, plus an Expo app in `mobile/` for workers. Both talk to the same server-side service layer.

## Commands

Web app (repo root):

```bash
npm run dev                  # Next dev server on :3000
npm run build                # prisma generate && next build
npx tsc --noEmit             # type check — also enforces enum parity (see below); there is no lint script
npm test                     # Jest (excludes mobile/)
npx jest src/server/services/__tests__/photos.test.ts   # one file
npx jest -t "submitTask"     # tests whose name matches
npm run prisma:generate      # after editing prisma/schema.prisma
```

Mobile (`cd mobile`): `npm start`, `npm run typecheck`, `npm test` (jest-expo), `npm run bundle:check`. Install with `npm install --legacy-peer-deps`.

## The database is production

`.env` points `DATABASE_URL`/`DIRECT_URL` at the **live** Supabase database. There is no staging. Ask before any migration, seed, or write.
- **Never run `prisma migrate dev` (`npm run prisma:migrate`) against it.** `_prisma_migrations` holds a row for an uncommitted migration, so `migrate dev` would try to reset the database. Apply schema changes with `prisma migrate deploy`.
- Tests never need a database: Prisma is mocked (below).

## Architecture: one service layer, two transports

Every business rule lives once, in `src/server/services/*`, and is called by two thin adapters:

```
web:    page.tsx / actions.ts ──requireRole / requirePageSession (src/lib/guard.ts, NextAuth cookie)──┐
mobile: src/app/api/v1/**/route.ts ──requireApi (src/server/api/auth.ts, bearer JWT)───────────────────┴─> service(actor, input) -> ServiceResult
```

- **Services** take an explicit `Actor` (`src/server/actor.ts`) and typed input, and return `ServiceResult` (`src/server/result.ts`) instead of throwing. Every service re-checks authorization with `assertRole`, even though middleware, `requireRole` and `requireApi` have already checked it. Services never touch `FormData`, `revalidatePath`, `redirect`, or the session. They return serialized data (Decimal → number, Date → ISO string, via `src/server/serialize.ts`). Read-side services are the `*Reads.ts` files. Pages don't query Prisma directly.
- **Server actions** (`src/app/*/actions.ts`) only adapt: authenticate, read FormData with `src/lib/formData.ts`, call the service, then `revalidatePath`. They don't import prisma or zod. They return `ActionState` (`{ error }` / `{ ok: true }`).
- **REST routes** (`src/app/api/v1`) are wrapped in `handle()` and end with `respond()`/`serviceError()` from `src/server/api/respond.ts`. These map `ServiceErrorCode` to an HTTP status (VALIDATION 400, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, STATE 422) inside a single `{ error: { code, message } }` envelope. Mutating routes pass `fresh: true` so the role is re-read from the DB rather than trusted from the 15-minute token. A resource belonging to another worker returns 404, not 403.
- **Error messages are user-facing**: the web UI and the API show them verbatim.
- New REST endpoints should be another thin adapter over an existing service, not new logic beside it. These rules exist in exactly one place and must not be reimplemented: decrementing material stock once per job, the owner/admin/worker privilege ladder (`src/lib/privileges.ts`), the last-active-manager guard, and the calendar's role-based hiding of prices and billing.

### Contracts shared with mobile

`src/contracts/*` holds the Zod schemas that the API validates against. The mobile app imports the same files as `@contracts/*`, so they **must not import `@prisma/client` or anything from `next`**. Enums are restated in `src/contracts/enums.ts`. `src/server/enumParity.ts` fails `tsc` if they drift from the Prisma schema, so add new enum values in both places.

### Auth

- Web: NextAuth credentials against the app's own `User` table (`src/lib/auth.ts`). Supabase Auth is not used. `src/middleware.ts` gates routes by role prefix. Roles are `OWNER`, `ADMIN`, `WORKER`. OWNER is read-only except on `/users`.
- Mobile: `src/server/api/tokens.ts` issues 15-minute HS256 access tokens, with a key derived from `NEXTAUTH_SECRET` via HKDF. It also issues 30-day refresh tokens that rotate on every use. A reused refresh token is treated as a replay.

### Time

Everything is interpreted in the business timezone stored in `AppSettings` (Settings → Business hours), not the server clock (Vercel is UTC). Use the helpers in `src/lib/timezone.ts`. `BUSINESS_TZ` is only the fallback used before that settings row exists. The one exception is the FullCalendar grid, which renders in the viewer's timezone. The mobile app does **no** date arithmetic. The server sends a `dayKey` per task and a `businessDay` value, both strings in the business timezone, and the app compares them as strings.

### Other pieces

- Cron (`vercel.json`): `/api/cron/recurrence` expands recurring jobs; `/api/cron/photo-retention` purges photos older than `PHOTO_RETENTION_DAYS` (default 183). Both check `CRON_SECRET` via `src/server/api/cronAuth.ts`. If `CRON_SECRET` is unset, both endpoints are unguarded.
- Task photos live in the private Supabase Storage bucket `task-photos` (`src/server/storage/photoStorage.ts`). Clients only ever get short-lived signed upload and download URLs. The storage URL is derived from `DATABASE_URL` unless `SUPABASE_URL` is set. Storage needs `SUPABASE_SERVICE_ROLE_KEY`.
- Notifications are pushed live over SSE (`src/app/api/notifications/stream`).
- PDFs (invoices, receipts, estimates) use `@react-pdf/renderer`.

## Testing

Tests live in `__tests__/` next to the code they cover. The default environment is jsdom. Pure-logic and service suites start with a `/** @jest-environment node */` docblock. Mock Prisma like this:

```ts
jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
```

Seed only the calls a test asserts on. Service tests also mock `@/lib/notify`.

## Mobile app (`mobile/`)

Expo SDK 57, expo-router, RN 0.86. Read `mobile/README.md` and `mobile/AGENTS.md` before changing it. The SDK has changed, so check the v57 docs. The root `tsconfig.json` and `jest.config.js` exclude `mobile/`, which has its own.
- Run `npm run bundle:check` before committing anything that touches imports. tsc resolves imports through tsconfig paths and Metro through `metro.config.js`, and the two can disagree.
- `metro.config.js` needs both `watchFolders` and `nodeModulesPaths` for `@contracts/*`. Do **not** set `disableHierarchicalLookup`, and do **not** add a `babel.config.js`.
- zod is pinned to 3.x to match the web app. `expo install zod` pulls v4 and breaks the shared contracts.
- Tokens go in SecureStore, never AsyncStorage. Token refresh in `src/api/client.ts` is single-flight: concurrent refreshes would look like a replay and sign the user out.
- To test against local dev, set `EXPO_PUBLIC_API_URL` to the machine's LAN IP, not `localhost`. It defaults to production.
