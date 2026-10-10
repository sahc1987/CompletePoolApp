# CompletePoolApp

Business management system for a pool service company. A Next.js web app runs the office (scheduling, clients, billing, estimates, inventory, payroll, KPIs) and an Expo mobile app runs the field (a worker's daily jobs, photos, materials, and on-site estimates) and gives admins and owners the office on their phone. Both talk to one shared server-side service layer.

[![Live App](https://img.shields.io/badge/Live_App-complete--pool--app.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://complete-pool-app.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Expo](https://img.shields.io/badge/Expo_SDK_57-000020?style=flat-square&logo=expo&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![NextAuth.js](https://img.shields.io/badge/NextAuth.js-000000?style=flat-square)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=flat-square&logo=stripe&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=jest&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Roles and Permissions](#roles-and-permissions)
- [Business Workflows](#business-workflows)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [REST API Reference](#rest-api-reference)
- [Security Specification](#security-specification)
- [Scheduled Jobs](#scheduled-jobs)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Mobile App](#mobile-app)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

## Features

### Roles and access

- Three roles: **Owner**, **Admin**, and **Worker**. Routes are gated by role in middleware, and every service re-checks authorization on its own.
- Privilege ladder for who may administer and appoint whom, plus a guard that prevents removing the last active manager.
- Owner accounts are read-only everywhere except user management.
- Sessions renew automatically so active users aren't signed out mid-shift.

### Scheduling and calendar

- FullCalendar day/week/month views for assigning and editing jobs.
- Recurring jobs (daily, weekly, biweekly, monthly) expanded by a daily cron, with the option to end a series after any occurrence.
- Business-hours validation and double-booking detection when assigning work.
- **Day map**: each day's stops plotted on a Leaflet/OpenStreetMap map, with addresses geocoded once and cached on the pool record, and one-tap Google Maps driving directions for a single stop or the whole route.
- Address autocomplete and a job-location map on client and pool forms.
- Prices and billing details hidden from workers on the calendar.
- All dates computed in the business timezone set in the app, not the server clock.

### Field work and review

- Task lifecycle: scheduled → in progress → submitted → approved or flagged for rework.
- Before/after photos stored in a private Supabase Storage bucket, accessed only through short-lived signed URLs, with automatic purge after a configurable retention period.
- Per-task material usage logging, recorded exactly once even across rework cycles.
- Admin review queue to approve work or flag it back to the worker with a reason.

### Clients and pools

- Client records with multiple pools per client, addresses, and coordinates.
- Searchable, paginated client list and a client detail page with job and billing history.

### Estimates

- Build estimates from a service catalog with custom line items and tax rates.
- Draft → presented → signed or declined workflow, with the customer signing in person on screen.
- Signed estimates convert directly into scheduled jobs.
- PDF export of estimates.

### Billing and payments

- Itemized invoices (service, add-ons, materials) that always reconcile to the bill total, with tax split per line.
- Cash, check, and online payments; partial and full payment status; payment reversals.
- **Stripe Checkout** online payments: invoices carry a pay link and QR code, customers pay the full balance by card, Apple Pay, or Google Pay, and payments are recorded only from Stripe's webhook.
- Numbered invoices and receipts generated as PDFs, branded with the business identity from settings.
- Billing page with date-range filtering and pagination.

### Materials and inventory

- Stock tracking with movement history (usage, restock, adjustment, reversal).
- Price snapshots so past bills keep the price charged at the time.
- Worker material requests with an admin approve/decline flow.
- Searchable, paginated materials list.

### Team and payroll

- User management: create users, assign roles, reset passwords, set employment details.
- Pay-rate history and weekly hours/pay per worker, computed from approved work.

### KPIs and notifications

- KPI dashboard: revenue, margin, material cost vs. billed, hours, approved jobs, per-worker performance, and material consumption.
- Real-time in-app notifications pushed over server-sent events.

### Settings

- Business hours and timezone, service and add-on catalog with pricing and durations, tax rates, and business identity used on invoices and receipts.

### Security

- Credentials auth against the app's own `User` table with bcrypt hashing.
- Per-account lockout and per-source rate limits on failed sign-ins.
- Postgres-backed request rate limiting on API auth endpoints (works across serverless instances).
- Row level security enabled on the Supabase database.
- Secret-protected cron endpoints.

### Mobile app (Expo)

- **Worker side**: sign in, see today's jobs, start a job, take before/after photos, log materials, and submit for review.
- Request materials from the field.
- Build, present, and get estimates signed on the phone with an on-screen signature pad.
- **Manager side** (admin and owner): dashboard, team schedule (week strip and day list), review queue with photos, every worker's route on a map, clients and pools, billing (record payments, undo payments, share the card pay link), invoices and receipts through the share sheet, materials and stock, team management, settings, and owner KPIs.
- Owner sees the manager side read-only, as on the web.
- Tokens kept in SecureStore with single-flight refresh.
- Android ships as a direct-install APK built on EAS, with over-the-air JavaScript updates on the `production` channel. App ID `com.completepool.app`.

### Public demo

- Optional "Explore the demo" button on the sign-in screen signs in as `demo@completepool.app`, a read-only admin.
- Every write is blocked at the auth gates (`requireUser` / `requireRole` for server actions, `requireApi` for any non-GET API call), so services need no demo logic.
- The button only appears while `DEMO_LOGIN_PASSWORD` is set. Create the account with `node scripts/create-demo-user.js`.

### REST API (`/api/v1`)

- Versioned API used by the mobile app, covering every module: auth, tasks, photos, agenda, day route, clients and pools, estimates, bills and payments, materials, material requests, users, settings, KPIs, notifications, and account. See the [REST API Reference](#rest-api-reference).
- 15-minute access tokens plus 30-day rotating refresh tokens with replay detection.
- Consistent `{ error: { code, message } }` envelope mapped to HTTP status codes.

## Roles and Permissions

Roles are ranked `WORKER (1) < ADMIN (2) < OWNER (3)`. Access is enforced twice: in `src/middleware.ts` for web routes, and again inside every service.

| Web area | Owner | Admin | Worker |
| --- | :---: | :---: | :---: |
| Calendar (`/calendar`) | read | full | read, no prices |
| Assign jobs (`/assign`) | | full | |
| Review queue (`/review`) | | full | |
| Clients and pools (`/clients`) | | full | |
| Estimates (`/estimates`) | | full | full |
| Billing and payments (`/billing`) | read | full | |
| Materials and requests (`/materials`) | | full | |
| Settings (`/settings`) | | full | |
| Team and users (`/users`) | full | full | |
| KPIs (`/kpi`) | full | | |
| Worker day (`/worker`) | | | full |
| My account (`/account`) | full | full | full |

Administration rules (`src/lib/privileges.ts`):

- An actor may administer a user (reset password, change role, disable, edit pay) only if the actor's rank is **strictly greater** than the target's. Peers cannot take each other over, and nobody can administer an owner.
- An actor may grant any role **up to and including** their own rank. Admins can appoint admins but cannot create or promote owners.
- The last active manager cannot be disabled or demoted.
- Owners are read-only everywhere except user management.
- Disabling a user revokes their sessions and refresh tokens, signing them out everywhere.

## Business Workflows

### Job (task) lifecycle

```
SCHEDULED --start--> IN_PROGRESS --submit--> SUBMITTED --approve--> APPROVED --> Bill created
    |                                            |
    |                                            +--flag (reason)--> FLAGGED --resubmit--> SUBMITTED
    +--cancel--> CANCELLED   (logged material usage returns to stock as REVERSAL)
```

- Admins can also **finish** a job directly from the schedule.
- Submitting records material usage exactly once, even across flag and rework cycles.
- Approval snapshots service price, add-ons, and materials into a `Bill`.
- Assignment validates business hours and rejects double-booking a worker.

### Recurring jobs

- Frequencies: `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`. Weekly and biweekly rules take days of week (0 = Sunday).
- The daily recurrence cron expands rules into concrete tasks.
- **End series** on any occurrence closes the rule from that point on.

### Estimates

```
DRAFT --present--> PRESENTED --sign (name + signature)--> APPROVED --schedule--> Task
  ^                    |
  +------draft---------+--decline (reason)--> DECLINED
```

- Line items with quantity and unit price, from the service catalog or free text.
- Taxes are snapshotted (name and rate) when added, and subtotal, tax, and total are snapshotted on present and sign, so later catalog changes never alter a signed estimate.
- The signature is captured in person as a base64 PNG. The customer never logs in.

### Billing and payments

- Bill status: `PENDING` (nothing collected) → `PARTIAL` (balance owed) → `PAID`.
- Methods: `CASH`, `CHECK` (check number required), `ONLINE` (Stripe).
- Balance = bill amount minus the sum of payments. Overpayment is rejected.
- **Undo payments** removes a bill's payments and writes a `PaymentReversal` audit row with the reason, amount, count, and who did it.
- Invoices (`INV-000042`) and receipts are sequentially numbered and rendered as PDFs with the business identity from settings.
- **Stripe**: each bill has a random `payToken` for its public pay link (`/pay/<token>`) and QR code. An open Checkout Session is reused for the same balance, and payments are recorded only from the webhook, deduplicated by `stripePaymentIntentId`.

### Materials and inventory

- Every stock change is a `StockMovement`: `USAGE` (negative), `RESTOCK`, `ADJUSTMENT`, or `REVERSAL`.
- Materials carry a cost price and a customer price. Task usage snapshots both.
- Low stock is flagged when quantity on hand is at or below the reorder threshold.
- Worker requests go `PENDING` → `APPROVED` / `DENIED`, with optional urgency and task link. Approving does not change stock; only a restock does.

### Payroll

- Hourly rate changes are kept in an append-only `PayRateChange` history (old rate, new rate, who changed it, note).
- Weekly hours and pay are computed from approved work, with weeks starting Monday in the business timezone.

## Architecture

Every business rule lives once in `src/server/services/*`. Two thin adapters call it:

```
web:    page.tsx / actions.ts --(NextAuth session)--+
mobile: src/app/api/v1/**/route.ts --(bearer JWT)---+--> service(actor, input) -> ServiceResult
```

- Services take an explicit actor and typed input, re-check authorization, and return a result instead of throwing.
- Server actions and API routes only authenticate, parse input, call a service, and shape the response.
- Zod schemas in `src/contracts/*` are shared by the API and the mobile app, so a wrong request shape fails to compile on the phone instead of failing at runtime. A type-level check keeps contract enums in sync with the Prisma schema.

## Data Model

PostgreSQL via Prisma (`prisma/schema.prisma`). Money fields are `Decimal`; ids are `cuid`.

| Model | Purpose |
| --- | --- |
| `User` | Account with role, active flag, bcrypt password hash, phone, hourly rate, hire date, birthday |
| `PayRateChange` | Append-only pay-rate audit trail |
| `AppSettings` | Single row: business hours, IANA timezone, company identity, payment terms, document footer |
| `RefreshToken` | SHA-256 hash of a mobile refresh token, family id for replay detection, expiry, used and revoked timestamps |
| `ApiRateLimit` | Fixed-window request counters for API auth endpoints |
| `LoginAttempt` / `LoginSource` | Failed sign-in throttling by typed email and by client IP |
| `Notification` | Per-recipient in-app notification with link and read state |
| `Client` | Customer with billing address, contact info, notes |
| `Pool` | Service location for a client, with size, type, and cached geocoded coordinates |
| `Service` / `ExtraService` | Service catalog (base price, default duration) and add-ons |
| `RecurrenceRule` | Frequency, days of week, start and end dates |
| `Task` | Scheduled job: client, pool, worker, service, start time, duration, price, status, review fields |
| `TaskExtra` | Add-on on a task with price at time of sale |
| `TaskMaterial` | Material used on a task with cost and customer price snapshots |
| `Photo` | Before/after photo reference in Supabase Storage |
| `Bill` | Invoice for an approved task: number, amount, status, pay token, Stripe session |
| `Payment` | Money in against a bill: receipt number, method, check number, Stripe payment intent |
| `PaymentReversal` | Audit record of undone payments |
| `Material` | Inventory item: unit, cost price, customer price, quantity on hand, reorder threshold |
| `StockMovement` | Every inventory change, linked to its task when applicable |
| `MaterialRequest` | Worker request for material, with response and responder |
| `TaxRate` | Reusable tax rate (percent) that can be switched off |
| `Estimate` / `EstimateLineItem` / `EstimateTax` | Quote, its lines, and snapshotted taxes |

Enums: `Role`, `TaskStatus`, `Frequency`, `PhotoType`, `StockMovementType`, `MaterialRequestStatus`, `PaymentStatus`, `PaymentMethod`, `EstimateStatus`. A type-level check (`src/server/enumParity.ts`) keeps the Zod contract enums identical to Prisma's.

## REST API Reference

Base path `/api/v1`. Requests and responses are JSON. Authenticated endpoints take `Authorization: Bearer <accessToken>`. Request bodies are validated against the Zod schemas in `src/contracts/*`.

Errors always use one envelope:

```json
{ "error": { "code": "VALIDATION", "message": "Human readable message" } }
```

| Code | HTTP |
| --- | --- |
| `VALIDATION` | 400 |
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `STATE` (operation not valid in the current state) | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL` | 500 |

### Auth and account

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/login` | Email and password → access token, refresh token, user |
| POST | `/auth/refresh` | Rotate the refresh token, issue a new access token |
| POST | `/auth/logout` | Revoke the refresh token |
| GET | `/auth/demo` | Demo login availability |
| GET, PATCH | `/me` | Current user profile |
| POST | `/me/password` | Change own password |

### Scheduling and field work

| Method | Path | Description |
| --- | --- | --- |
| GET, POST | `/tasks` | List tasks, create a job |
| PATCH | `/tasks/:id` | Edit or reschedule a job |
| POST | `/tasks/:id/start` | Worker starts a job |
| POST | `/tasks/:id/submit` | Worker submits with material usage |
| POST | `/tasks/:id/finish` | Admin finishes a job |
| POST | `/tasks/:id/approve` | Admin approves (creates the bill) |
| POST | `/tasks/:id/flag` | Admin flags for rework with a reason |
| POST | `/tasks/:id/cancel` | Cancel a job |
| POST | `/tasks/:id/end-series` | End a recurring series from this occurrence |
| GET, POST | `/tasks/:id/photos` | List photos (signed URLs), register an uploaded photo |
| POST | `/tasks/:id/photos/upload-url` | Get a signed upload URL |
| DELETE | `/photos/:id` | Delete a photo |
| GET | `/agenda` | Agenda in business-day terms |
| GET | `/day-route` | Ordered stops with coordinates for the day map |
| GET | `/scheduling/catalog` | Clients, pools, workers, services, add-ons for job forms |

### Clients

| Method | Path | Description |
| --- | --- | --- |
| GET, POST | `/clients` | Search and paginate, create |
| GET, PATCH, DELETE | `/clients/:id` | Detail, update, delete |
| POST | `/clients/:id/pools` | Add a pool |
| PATCH, DELETE | `/pools/:id` | Update, delete a pool |

### Estimates

| Method | Path | Description |
| --- | --- | --- |
| GET, POST | `/estimates` | List, create |
| GET | `/estimates/catalog` | Data for the estimate builder |
| GET, DELETE | `/estimates/:id` | Detail, delete |
| POST | `/estimates/:id/line-items` | Add a line |
| DELETE | `/estimates/:id/line-items/:lineId` | Remove a line |
| POST | `/estimates/:id/taxes` | Apply a tax rate |
| DELETE | `/estimates/:id/taxes/:taxId` | Remove a tax |
| POST | `/estimates/:id/present` | Lock totals and present |
| POST | `/estimates/:id/draft` | Return to draft |
| POST | `/estimates/:id/sign` | Capture name and signature |
| POST | `/estimates/:id/decline` | Decline with a reason |
| POST | `/estimates/:id/schedule` | Convert an approved estimate into a job |

### Billing

| Method | Path | Description |
| --- | --- | --- |
| GET | `/bills` | List by status and date range |
| GET | `/bills/:id` | Bill detail with payments and reversals |
| POST | `/bills/:id/payments` | Record a cash, check, or card payment |
| POST | `/bills/:id/reverse` | Undo payments with a reason |
| GET | `/bills/:id/invoice` | Invoice PDF |
| GET | `/bills/:id/receipts/:paymentId` | Receipt PDF |

### Materials

| Method | Path | Description |
| --- | --- | --- |
| GET | `/materials` | Stock list with low-stock flags |
| GET, POST | `/materials/catalog` | Catalog, create material |
| PATCH | `/materials/:id` | Edit material |
| POST | `/materials/:id/toggle` | Retire or reactivate |
| POST | `/materials/:id/stock` | Restock or adjust (logged movement) |
| GET, POST | `/material-requests` | List requests, create a request |
| GET | `/material-requests/pending` | Admin inbox |
| POST | `/material-requests/:id/respond` | Approve or deny with a note |

### Team, settings, KPIs, notifications

| Method | Path | Description |
| --- | --- | --- |
| GET, POST | `/users` | List, create user |
| GET | `/users/:id` | Detail with eight weeks of hours and pay |
| POST | `/users/:id/role` | Change role |
| PUT | `/users/:id/employment` | Pay rate, hire date, birthday |
| POST | `/users/:id/toggle-active` | Disable or enable |
| POST | `/users/:id/password` | Reset password |
| GET | `/settings` | All settings and catalogs |
| PUT | `/settings/hours` | Business hours and timezone |
| PUT | `/settings/company` | Company identity for documents |
| POST / PATCH, DELETE | `/settings/services`, `/settings/services/:id` | Service catalog |
| POST / PATCH, DELETE | `/settings/extras`, `/settings/extras/:id` | Add-on catalog |
| POST / PATCH | `/settings/tax-rates`, `/settings/tax-rates/:id` | Tax rates |
| POST | `/settings/tax-rates/:id/toggle` | Switch a tax rate on or off |
| GET | `/kpi` | Owner KPIs |
| GET, POST | `/notifications` | List, mark read |

### Non-versioned endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET, POST | `/api/auth/[...nextauth]` | NextAuth web session |
| GET, POST | `/api/notifications` | Web notifications list, mark read |
| GET | `/api/notifications/stream` | Server-sent events for live notifications |
| POST | `/api/stripe/webhook` | Stripe events (signature verified) |
| GET | `/api/cron/recurrence` | Expand recurring jobs (cron secret) |
| GET | `/api/cron/photo-retention` | Purge old photos (cron secret) |

## Security Specification

| Control | Value |
| --- | --- |
| Password hashing | bcrypt |
| Web session | NextAuth JWT cookie, renewed while active; disabled accounts are sent back to sign-in |
| Mobile access token | HS256 JWT (`jose`), 15 minutes |
| Mobile refresh token | 256-bit random, stored as a SHA-256 hash, 30 days, rotated on every use |
| Refresh replay | Reusing a rotated token revokes the whole token family |
| Per-account lockout | 3 failed sign-ins → 30 second lock, keyed by the typed email so unknown emails behave the same as real ones |
| Per-source limit | 20 failed sign-ins per IP in 15 minutes → 15 minute lock |
| API request limit | `/auth/login` 20 requests per 5 minutes per IP; `/auth/refresh` 60 per 5 minutes per IP (Postgres-backed, works across serverless instances) |
| Photos | Private `task-photos` bucket, short-lived signed URLs, service role key kept server-side |
| Pay links | Random `payToken`, never derived from the bill id or invoice number |
| Stripe | Webhook signature verification; payments recorded idempotently |
| Cron | `Authorization: Bearer $CRON_SECRET` required |
| Database | Row level security enabled on Supabase |

## Scheduled Jobs

Registered in [`vercel.json`](./vercel.json):

| Path | Schedule (UTC) | Job |
| --- | --- | --- |
| `/api/cron/recurrence` | `0 6 * * *` | Expand recurring jobs into tasks |
| `/api/cron/photo-retention` | `0 4 * * *` | Delete photos older than `PHOTO_RETENTION_DAYS` (default 183) |

## Tech Stack

| Category | Technology |
| --- | --- |
| Web framework | Next.js 14 (React 18, TypeScript, App Router, Server Actions) |
| Mobile | Expo SDK 57, expo-router, React Native |
| Database/ORM | PostgreSQL on Supabase (row level security), Prisma ORM |
| File storage | Supabase Storage (private bucket, signed URLs) |
| Auth | NextAuth credentials (web), HS256 JWT access + rotating refresh tokens via `jose` (mobile) |
| Payments | Stripe Checkout + webhooks |
| Maps | Leaflet / React Leaflet, Photon (OpenStreetMap) geocoding, Google Maps URLs |
| Styling | Tailwind CSS |
| PDF generation | @react-pdf/renderer, `qrcode` |
| Calendar UI | FullCalendar |
| Validation | Zod |
| Testing | Jest, Testing Library, jest-expo |
| Hosting | Vercel (app + cron), Supabase (database + storage) |

## Getting Started

### Prerequisites

- Node.js and npm
- A Supabase project (or another Postgres instance; photo storage needs Supabase)

### Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the values (see [Environment Variables](#environment-variables)).

3. Apply the database schema and seed data:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

4. Start the dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Postgres connection (Supabase transaction pooler, port 6543, `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | yes | Direct connection for migrations (session pooler, port 5432) |
| `NEXTAUTH_SECRET` | yes | Signs web sessions and mobile access tokens (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | yes | App origin (`http://localhost:3000` locally) |
| `CRON_SECRET` | production | Protects both cron endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` | for photos | Signs photo upload and download URLs. Server only |
| `SUPABASE_URL` | no | Derived from `DATABASE_URL` when empty |
| `PHOTO_RETENTION_DAYS` | no | Photo retention period, default `183` |
| `STRIPE_SECRET_KEY` | no | Enables online card payments; empty turns them off |
| `STRIPE_WEBHOOK_SECRET` | with Stripe | Signing secret for `/api/stripe/webhook` |
| `APP_URL` | no | Public origin for pay links and QR codes; falls back to `NEXTAUTH_URL` |
| `BUSINESS_TZ` | no | Fallback timezone before settings exist, default `America/New_York` |
| `DEMO_LOGIN_PASSWORD` | no | Shows the public read-only demo login when set |
| `EXPO_PUBLIC_API_URL` | mobile, no | Server origin for the mobile app; defaults to `extra.apiUrl` in `mobile/app.json` |

## Mobile App

The mobile app (worker and manager sides) lives in [`mobile/`](./mobile). See [mobile/README.md](./mobile/README.md) for details.

```bash
cd mobile
npm install --legacy-peer-deps
npm start
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to point at a server. It defaults to production; for local development use your machine's LAN IP, not `localhost`.

## Available Scripts

- `npm run dev`: start the development server
- `npm run build`: run Prisma generate and build for production
- `npm run start`: start the production server
- `npm run prisma:generate`: regenerate the Prisma client
- `npm run prisma:migrate`: create/apply a local migration (local databases only)
- `npm run prisma:deploy`: apply migrations to a deployed database
- `npm run prisma:studio`: open Prisma Studio
- `npm run prisma:seed`: seed the database
- `npm test`: run the test suite
- `npm run test:watch`: re-run tests as files change
- `npm run test:coverage`: run the suite with a coverage report

Mobile (`cd mobile`): `npm start`, `npm run typecheck`, `npm test`, `npm run bundle:check`.

## Testing

[Jest](https://jestjs.io/) with [Testing Library](https://testing-library.com/), wired through `next/jest` so tests compile with the same SWC settings as the app and resolve the `@/…` alias.

No database is needed: suites that touch Prisma replace the client with the mock in [`src/test/prismaMock.ts`](./src/test/prismaMock.ts) and seed only the calls they assert on.

```ts
jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
```

Tests live in `__tests__` folders beside the code they cover. The default environment is `jsdom`; pure-logic and service suites opt out with a `@jest-environment node` docblock.

| Area | What is covered |
| --- | --- |
| `lib/timezone` | business-local wall clock, DST boundaries, day/week/month starts |
| `lib/schedule` | business-hours validation, double-booking detection, time parsing |
| `lib/recurrence` | recurring job expansion |
| `lib/billing` | partial vs. full payment, balance limits, payment reversal, invoice rows summing to the total, tax splits |
| `lib/payroll` | weekly hour buckets, pay rounding, which statuses count as worked |
| `lib/privileges` | who may administer and appoint whom |
| `lib/loginThrottle` | per-account lockout, per-source limits, client IP |
| `lib/materials` | usage parsing, stock decrement, price snapshots, double-entry guard |
| `lib/serialize` | Decimal → number, currency formatting |
| Day map | stop ordering and route data |
| Services | authorization, task lifecycle, job changes, business day, photos, users, route reads, online payments |
| API tokens | access/refresh token issue, rotation, and replay detection |
| Calendar / worker actions | material recorded once, ownership and status gates |
| Components | `PaymentFields`, `MaterialUsageFields` |
| Mobile | task data hooks (jest-expo) |

## Deployment

Deploys to **Vercel** with a **Supabase** Postgres database. [`vercel.json`](./vercel.json) registers two daily cron jobs: recurring job expansion and photo retention cleanup. See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions, and [`scripts/stripe-webhook-setup.js`](./scripts/stripe-webhook-setup.js) to register the Stripe webhook.

## Project Structure

```
src/
  app/            Next.js App Router pages: account, assign, billing, calendar,
                  clients, estimates, kpi, login, materials, pay (public Stripe
                  pay page), review, settings, users, worker
  app/api/        auth, cron, notifications (SSE), stripe webhook, v1 REST API
  components/     Shared UI components
  contracts/      Zod schemas shared with the mobile app
  lib/            Domain logic and utilities (billing, schedule, timezone, ...)
  server/
    services/     Business rules (one place for web and mobile)
    api/          Token auth, rate limiting, response envelope
    payments/     Stripe client
    storage/      Supabase photo storage
  test/           Prisma client mock
  middleware.ts   Role-based route protection
mobile/           Expo app: app/(worker), app/(manager), sign-in (expo-router)
prisma/
  schema.prisma   Database schema
  migrations/     Migration history
  seed.ts         Seed script
scripts/          Stripe webhook setup, demo user creation
```

## Author

**Saul Hernandez** · [GitHub](https://github.com/sahc1987) · [LinkedIn](https://linkedin.com/in/saul-hernandez-dev)
