# Security: CompletePoolApp

Status: Complete

## Authentication method
- Web: NextAuth credentials against the app's own `User` table (`src/lib/auth.ts`). `src/middleware.ts` gates routes by role prefix; pages use `requirePageSession`, actions use `requireRole`.
- Mobile: bearer JWT. 15-minute HS256 access tokens (key derived from `NEXTAUTH_SECRET` via HKDF) and 30-day refresh tokens that rotate on every use. A reused refresh token is treated as a replay. Tokens are stored in SecureStore, never AsyncStorage. Refresh is single-flight in `mobile/src/api/client.ts`.
- Mutating REST routes pass `fresh: true`, so the role is re-read from the database rather than trusted from the token.

## Roles and permissions matrix
| Area | OWNER | ADMIN | WORKER |
|---|---|---|---|
| Users (`/users`) | Read and write | No | No |
| Scheduling, billing, estimates, materials, KPIs | Read only | Read and write | No |
| Own assigned tasks, photos, material requests | No | Yes | Own only |
| Prices and billing on the calendar | Visible | Visible | Hidden |

- Every service re-checks authorization with `assertRole`, even after middleware and route guards.
- A resource belonging to another worker returns 404, not 403.
- The privilege ladder (`src/lib/privileges.ts`) and the last-active-manager guard exist in one place and must not be reimplemented.
- The public demo login (`demo@completepool.app`) is read-only on the live site: new reads use `requireReader`, new writes must go through the guards.

## Sensitive data inventory and protection
| Data | Protection |
|---|---|
| Client PII (name, phone, email, addresses) | Role-gated services; never logged |
| Password hashes, refresh tokens | Hashed/rotating; replay detection; never returned by APIs or logged |
| Payment data | Card data stays with Stripe (SAQ-A scope); only `stripePaymentIntentId` and check numbers are stored; pay links use a random `payToken` |
| Task photos and estimate signatures | Private `task-photos` bucket, short-lived signed URLs only; photos purged after 183 days; signature stored as base64 in the DB |

## Secrets management
Secrets live in environment variables (Vercel project settings, local `.env`, never committed): `NEXTAUTH_SECRET`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, database URLs, Stripe keys. `.env` points at the live database, so treat local `.env` as production credentials. Mobile only gets `EXPO_PUBLIC_*` values, which are public.

## Input validation
Zod schemas in `src/contracts/*` validate all REST input. Server actions read FormData through `src/lib/formData.ts` and pass typed input to services, which validate again. Services return `ServiceResult` with a `VALIDATION` code instead of throwing.

## Rate limiting and abuse
`ApiRateLimit`, `LoginAttempt` and `LoginSource` tables back API rate limits and login throttling. Cron endpoints are protected by `CRON_SECRET` (`src/server/api/cronAuth.ts`). If `CRON_SECRET` is unset both endpoints are unguarded, so it must always be set in production.

## Logging and monitoring
Logs go to Vercel. Never log: passwords, tokens or refresh tokens, `NEXTAUTH_SECRET`/service keys, signature data, billing addresses, or full client PII. Error messages are shown to users verbatim, so they must not leak internals.

## Dependency scanning
Dependabot and `npm audit` for both the root and `mobile/` packages.

## Compliance needs
No formal regime. Stay in PCI SAQ-A scope by never handling card data directly (Stripe Checkout only).

## Incident response basics
Formal on-call process:
1. Detect and triage by severity (data exposure, auth bypass, outage, billing error).
2. Assign an on-call owner; record a timeline.
3. Contain: rotate `NEXTAUTH_SECRET` and other keys (this invalidates sessions), revoke refresh tokens, disable the demo or affected account, set `CRON_SECRET` if missing.
4. Recover: restore from a Supabase backup if data was damaged (confirm backup tier first, see [DATABASE.md](DATABASE.md)).
5. Notify affected clients if their data was exposed.
6. Write a blameless postmortem and add a regression test.
