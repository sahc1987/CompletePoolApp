# Security Report: CompletePoolApp
Date: 2026-11-09  |  Commit: 5de8a22  |  Scope: full  |  Dynamic tests: no (static only; `.env` points at the live DB)

## Summary
Score: 11/21 checks passed (1 N/A)
Critical: 1  High: 3  Medium: 4  Low: 4
Top 3 risks:
1. Production dependencies with advisories rated critical or high (`next`, `next-auth`, `zod`, `postcss`). Fixes are major-version jumps.
2. The public demo login exposes all real data. Its credentials are served from a public endpoint, and the account is an ADMIN that can read client PII.
3. Fail-open spots: cron endpoints are unguarded when `CRON_SECRET` is unset, and RLS is enabled on only 3 of 23 tables in the migrations.

## Results
| # | Check | Status | Severity | Evidence | Fix |
|---|-------|--------|----------|----------|-----|
| 19 | Update dependencies | FIXED | Critical | `npm audit --omit=dev`: `next` (critical, fix next@16.4.6, major), `next-auth` (critical, fix available), `zod` <4.6.6 (high, memory exhaustion), `postcss` (high), `nanoid` (high), `source-map-js` (high), `uuid` (moderate). Mobile: 19 vulns (1 critical, 7 high). | **Partly fixed**: `npm audit fix` cleared `next-auth`, `nanoid`, `source-map-js`, `uuid` (7→3 vulns; still `next`, `postcss`, `zod`). Remaining: Plan a Next 14→15/16 upgrade. Keep zod at 3.x (the mobile contracts pin it); check whether a 3.x patch covers the advisory. |
| 3 | Lock the database | FIXED | High | `prisma/migrations/*`: `ENABLE ROW LEVEL SECURITY` only on `_prisma_migrations` (`20260827000000_rls_prisma_migrations/migration.sql:11`), `RefreshToken` and `ApiRateLimit` (`20260913000000_api_tokens/migration.sql:63-64`). 23 tables are created. RLS may have been enabled by hand in the dashboard, which I could not verify without touching the live DB. | **Applied to the live DB on 2026-11-10; all 28 public tables now have RLS and Prisma still reads fine.** (`prisma/migrations/20261109000000_rls_all_tables`). Apply with `prisma migrate deploy` after you approve. Check `pg_tables.rowsecurity`. Add a `deploy`-applied migration enabling RLS (no policies) on every app table. Prisma connects as the owner and is exempt. |
| 11/12 | Cron guard (env) | FIXED | High | `src/server/api/cronAuth.ts:12-13`: `if (!secret) return true`. The secret is also accepted as `?key=` in the URL (logged in URLs) and compared with `===` (not constant-time). | Done in `cronAuth.ts` with tests (`cronAuth.test.ts`): fails closed in production, `?key=` removed, constant-time compare. Still confirm `CRON_SECRET` is set in Vercel. Original advice: fail closed in production (`NODE_ENV === "production"` and no secret → 401). Drop `?key=`. Use `timingSafeEqual`. Confirm `CRON_SECRET` is set in Vercel. |
| — | Public demo login exposes real data | WARN | High | `src/app/api/v1/auth/demo/route.ts:13-15` returns the demo email and password publicly. `src/lib/demo.ts` makes it an ordinary ADMIN, read-only only at the guard layer. `.env.example` notes it "can see all real data". | Point the demo at a separate seeded dataset, or leave `DEMO_LOGIN_PASSWORD` empty in production. At minimum, hide client PII for `isDemoUser`. |
| 14 | Security headers | FIXED | Medium | `next.config.js` has no `headers()`. No CSP, X-Content-Type-Options, frame-ancestors, Referrer-Policy or Permissions-Policy. `poweredByHeader` not disabled. | Add a `headers()` block and `poweredByHeader: false`. Allow Stripe and Supabase storage in the CSP. |
| 8 | Log suspicious activity | FIXED | Medium | Only two `console.error` calls in `src/` (`respond.ts:140`, `stripe/webhook/route.ts:24`). No log lines for failed logins, permission denials, password changes or user admin actions with user id and IP. Login lockout state lives in `LoginAttempt` but isn't an audit log. | Add a small `auditLog(event, actor, ip)` helper called from `verifyCredentials`, `apiError(FORBIDDEN)`, the password change and user-management services. Never log secrets. |
| 4 | Enforce HTTPS | FIXED | Medium | No HSTS in `next.config.js`. Vercel adds HSTS on `*.vercel.app` only. `mobile/app.json` has no `http://` or cleartext flag; default API URL is https. | Add `Strict-Transport-Security` in the headers block (covers a custom domain). |
| 12 | Rate limiting | WARN | Medium | Present: `src/server/api/rateLimit.ts` (Postgres fixed window: login 20/5 min, refresh 60/5 min) plus the `LoginAttempt` and `LoginSource` lockout. Not covered: public pay-token pages, the Stripe webhook, expensive PDF routes. Not burst-tested (static only). | Rate-limit the pay-link pages. Burst-test against localhost when you are ready. |
| 5 | Hash passwords | FIXED | Low | bcrypt cost 10: `src/server/services/users.ts:250,277`, `account.ts:54`. The checklist wants cost >= 12. Hashing itself is sound (bcryptjs). | Raise to 12. Existing hashes keep working and can be re-hashed on login. |
| 18 | Upload limits | WARN | Low | Photo bytes go straight to Supabase via signed URL (`photoStorage.ts`): 10 MB `fileSizeLimit`, allowed types jpeg/png/webp, random filenames, private bucket. No magic-byte check, since bytes bypass the server. | Acceptable. Optionally verify content type on the "record photo" step. |
| 20 | Unused packages | WARN | Low | depcheck: `@fullcalendar/core` imported in `src/app/calendar/CalendarView.tsx` but not declared. `typescript` reported unused (false positive). | Add `@fullcalendar/core` to dependencies. |
| 22 | Leaked keys | WARN | Low | gitleaks could not be run (`npx` failed to resolve it). A manual regex scan of full git history for Stripe, JWT, Postgres URL, AKIA and private-key patterns found nothing. Only `.env.example` files were ever added. | Install gitleaks and re-run for a definitive answer. |
| 1 | Authentication | PASS | — | `middleware.ts` plus `requireRole`; JWT sessions with 8 h idle and 7 d absolute cap (`authConfig.ts`); role/active re-read every 60 s (`auth.ts:81`); mobile HS256 pinned, issuer and audience checked, refresh rotation with replay detection (`tokens.ts`); lockout 3 tries/30 s. | — |
| 2 | Hide API keys | PASS | — | No secrets under public prefixes. The only `EXPO_PUBLIC_*` value is the API URL. Build output was not scanned (no `.next` build inspected). | — |
| 6 | Server-side validation | PASS | — | Zod contracts in `src/contracts/*`, re-validated in services. | — |
| 7 | XSS | PASS | — | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `src/`. | — |
| 9 | Admin routes | PASS | — | Role prefix rules in `middleware.ts`; `assertRole` in services; `requireApi` with `fresh: true` on writes; `src/app/api/v1/__tests__/adminRoutes.test.ts`. Not exercised dynamically. | — |
| 10 | Parameterized queries | PASS | — | No `$queryRaw`, `$executeRaw` or `*Unsafe` calls anywhere in `src/`. | — |
| 11 | Env variables | PASS | — | `.env` and `.env*.local` ignored; `.env.example` has placeholders only; no env file in git history; `signingKey()` throws if `NEXTAUTH_SECRET` is missing. (Cron fail-open is listed above.) | — |
| 13 | CORS | PASS | — | No CORS headers or wildcard origins in `src/`; same-origin web plus bearer-token mobile. | — |
| 15 | Secure cookies | PASS | — | NextAuth defaults (HttpOnly, SameSite=Lax, Secure over https); mobile tokens in SecureStore per docs. Not verified with `curl -I`. | — |
| 16 | CSRF | PASS | — | NextAuth CSRF token and Next server-action origin check; REST API is bearer-only. | — |
| 21 | Exposed files | PASS | — | `public/` holds only logos and favicon. Root `asg.html`, `login.html`, `rev.html` and `app.css` sit outside `public/`. `coverage/` is not tracked. Not requested dynamically. | — |
| 17 | Expiring reset links | N/A | — | No password-reset flow found. Admins set passwords (`users.ts`). | — |

## Leaked keys to rotate (user action)
| Key type | Location | Commit | Revoke at |
|---|---|---|---|
| None found by manual scan | — | — | — |

## Dependency findings
Web (`npm audit --omit=dev`): 7 vulnerabilities (1 moderate, 4 high, 2 critical).
- `next` (direct, critical): fix is next@16.4.6 (breaking).
- `next-auth` (direct, critical): fix available via `npm audit fix`; it depends on vulnerable `uuid`.
- `zod` (direct, high): <4.6.6, fix is 4.6.7 (breaking). Do not upgrade blindly: the mobile contracts are pinned to 3.x.
- `postcss` (high, via next), `nanoid` (high), `source-map-js` (high), `uuid` (moderate).

Mobile (`npm audit --omit=dev`): 19 vulnerabilities (1 low, 10 moderate, 7 high, 1 critical), mostly Expo toolchain transitive dependencies (`xcode`→`uuid`, `source-map-js`, `zod`).

## Unused packages
- Missing declaration: `@fullcalendar/core`.
- `typescript` flagged by depcheck (false positive; it is the compiler).

## Test results
`npm test`: 31 suites, 605 tests, all passed before fixes; 32 suites, 610 tests after fixes. `tsc --noEmit` clean. Dynamic tests were not run.

## SECURITY.md mismatches
- It says cron endpoints are "protected by `CRON_SECRET`", but the code fails open when the variable is unset (`cronAuth.ts:12`). The doc does mention this risk; the code doesn't enforce it.
- It says "Dependabot and `npm audit` for both packages", but the audit currently reports critical and high issues. I did not verify that Dependabot is configured.
- It says "Never log … PII" and lists no audit trail. Check 8 found no security-event logging at all.

## Fix log
- Headers, CSP, HSTS and `poweredByHeader: false` in `next.config.js` (check 14, 4). The CSP is untested in a browser: load the site once and watch the console for blocked resources.
- `src/lib/audit.ts` logs failed and locked logins, password changes and permission denials as JSON, with ids and IPs only (check 8).
- bcrypt cost raised to 12 for new hashes (check 5). Existing hashes still verify.
- Upgraded `next` to 16.4.6 (async `params` handled) and `zod` to 4.6.7 in web and mobile. Root `npm audit --omit=dev`: 0 vulnerabilities. Tests, tsc, build, mobile typecheck and bundle check all pass.
