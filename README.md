# CompletePoolApp

Business management system for a pool service company. A Next.js web app runs the office (scheduling, clients, billing, estimates, inventory, payroll, KPIs) and an Expo mobile app runs the field (a worker's daily jobs, photos, materials, and on-site estimates). Both talk to one shared server-side service layer.

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
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
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

### Mobile worker app (Expo)

- Sign in, see today's jobs, start a job, log materials, take photos, and submit for review.
- Request materials from the field.
- Build, present, and get estimates signed on the phone.
- Tokens kept in SecureStore with single-flight refresh.

### REST API (`/api/v1`)

- Versioned API used by the mobile app: auth (login, refresh, logout), tasks, photos, materials, material requests, estimates, notifications, and account.
- 15-minute access tokens plus 30-day rotating refresh tokens with replay detection.
- Consistent `{ error: { code, message } }` envelope mapped to HTTP status codes.

## Architecture

Every business rule lives once in `src/server/services/*`. Two thin adapters call it:

```
web:    page.tsx / actions.ts --(NextAuth session)--+
mobile: src/app/api/v1/**/route.ts --(bearer JWT)---+--> service(actor, input) -> ServiceResult
```

- Services take an explicit actor and typed input, re-check authorization, and return a result instead of throwing.
- Server actions and API routes only authenticate, parse input, call a service, and shape the response.
- Zod schemas in `src/contracts/*` are shared by the API and the mobile app, so a wrong request shape fails to compile on the phone instead of failing at runtime. A type-level check keeps contract enums in sync with the Prisma schema.

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

2. Copy `.env.example` to `.env` and fill in the values:

- `DATABASE_URL`: pooled connection string (runtime)
- `DIRECT_URL`: direct connection string (migrations)
- `NEXTAUTH_SECRET`: generate with `openssl rand -base64 32`
- `NEXTAUTH_URL`: `http://localhost:3000` for local development
- `BUSINESS_TZ`: optional fallback timezone (defaults to `America/New_York`)
- `CRON_SECRET`: authorizes the cron endpoints
- `SUPABASE_SERVICE_ROLE_KEY`: needed for task photo storage
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`: optional; leave unset to turn online payments off

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

## Mobile App

The worker app lives in [`mobile/`](./mobile). See [mobile/README.md](./mobile/README.md) for details.

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
mobile/           Expo worker app (expo-router)
prisma/
  schema.prisma   Database schema
  migrations/     Migration history
  seed.ts         Seed script
scripts/          Stripe webhook setup
```

## Author

**Saul Hernandez** · [GitHub](https://github.com/sahc1987) · [LinkedIn](https://linkedin.com/in/saul-hernandez-dev)
