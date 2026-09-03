# CompletePoolApp

A business management web app for a pool service company, built with Next.js. It handles job scheduling, worker task tracking, materials/inventory, client billing, and estimates in one place.

[![Live App](https://img.shields.io/badge/Live_App-complete--pool--app.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://complete-pool-app.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![NextAuth.js](https://img.shields.io/badge/NextAuth.js-000000?style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=jest&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

## Features

- 🔐 **Role-based access** for Owner, Admin, and Worker accounts, enforced via middleware and NextAuth sessions, with sessions that renew automatically so active users aren't logged out mid-shift.
- 📅 **Job scheduling & calendar** with recurring jobs (daily, weekly, biweekly, monthly) and an automated recurrence cron job.
- ✅ **Task lifecycle tracking** from scheduled to in progress to submitted to approved/flagged, including before/after photo capture and per-task material usage logging.
- 📦 **Materials & inventory management**, with stock movements (usage, restock, adjustment, reversal), a worker material request/approval flow, and a searchable, paginated materials list.
- 💳 **Client & billing management**, including payments (cash, check, online), partial/full payment status, payment reversals, itemized invoices (service/add-on/material line items), date-range filtering on the billing page, and a searchable, paginated client list.
- 📝 **Estimates**, presented and signed in person, with PDF generation for invoices and receipts.
- 📊 **KPI dashboard** for business performance at a glance.
- ⚙️ **Configurable business settings**, including business hours, timezone, and business identity used on invoices/receipts.
- 🔔 **Real-time notifications** for users on relevant activity, pushed live via server-sent events.

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | Next.js 14 (React 18, TypeScript) |
| Database/ORM | PostgreSQL via Supabase (row level security enabled), Prisma ORM |
| Auth | NextAuth (credentials-based, backed by the app's own `User` table) |
| Styling | Tailwind CSS |
| PDF generation | @react-pdf/renderer |
| Calendar UI | FullCalendar |
| Validation | Zod |

## Getting Started

### Prerequisites

- Node.js and npm
- A Supabase Postgres database (or another Postgres instance)

### Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the values:
- `DATABASE_URL` - pooled connection string (used at runtime)
- `DIRECT_URL` - direct connection string (used for migrations)
- `NEXTAUTH_SECRET` - generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` - `http://localhost:3000` for local development
- `BUSINESS_TZ` - optional fallback timezone (defaults to `America/New_York`)
- `CRON_SECRET` - secret used to authorize the recurrence cron endpoint

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

## Available Scripts

- `npm run dev` - start the development server
- `npm run build` - run Prisma generate and build for production
- `npm run start` - start the production server
- `npm run prisma:generate` - regenerate the Prisma client
- `npm run prisma:migrate` - create/apply a local migration
- `npm run prisma:deploy` - apply migrations to a deployed database
- `npm run prisma:studio` - open Prisma Studio
- `npm run prisma:seed` - seed the database
- `npm test` - run the test suite
- `npm run test:watch` - re-run tests as files change
- `npm run test:coverage` - run the suite with a coverage report

## Testing

[Jest](https://jestjs.io/) with [Testing Library](https://testing-library.com/),
wired through `next/jest` so tests compile with the same SWC settings as the app
and resolve the `@/…` alias.

No database is needed: suites that touch Prisma replace the client with the mock
in [`src/test/prismaMock.ts`](./src/test/prismaMock.ts) and seed only the calls
they assert on.

```
jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;
```

Tests live in `__tests__` folders beside the code they cover. The default
environment is `jsdom` for components; pure-logic suites opt out with a
`@jest-environment node` docblock at the top of the file.

Covered so far:

| Module | What is pinned down |
| --- | --- |
| `lib/timezone` | business-local wall clock, DST boundaries, day/week/month starts |
| `lib/schedule` | business-hours validation, double-booking detection, time parsing |
| `lib/billing` | partial vs. full payment, balance limits, payment reversal |
| `lib/billing` (invoice) | service/add-on/material rows always summing to the bill total |
| `lib/payroll` | weekly hour buckets, pay rounding, which statuses count as worked |
| `lib/privileges` | who may administer and appoint whom |
| `lib/loginThrottle` | per-account lockout, per-source spray limits, client IP |
| `lib/materials` | usage parsing, stock decrement, price snapshots, double-entry guard |
| `lib/serialize` | Decimal → number, currency formatting |
| `calendar/finishTask` | material recorded before the bill totals it; no double count |
| `worker/submitTask` | ownership, status gate, material logged once across reworks |
| `components/PaymentFields` | method-dependent fields and the names the action reads |
| `components/MaterialUsageFields` | field names, decimal keypad, filtering that can't drop an entry |

## Deployment

The app is designed to deploy to **Vercel** with a **Supabase** Postgres database. See [DEPLOY.md](./DEPLOY.md) for full step-by-step instructions, including environment variable setup and the daily recurrence cron job configuration.

## Project Structure

```
src/
  app/          Next.js app router pages (account, assign, billing, calendar,
                 clients, estimates, kpi, login, materials, review, settings,
                 users, worker, api routes, etc.)
  components/   Shared UI components
  lib/          Shared application logic/utilities (+ __tests__/)
  test/         Test helpers (Prisma client mock)
  types/        TypeScript types
  middleware.ts Route protection / role-based access control
prisma/
  schema.prisma Database schema
  migrations/   Prisma migration history
  seed.ts       Database seed script
```
