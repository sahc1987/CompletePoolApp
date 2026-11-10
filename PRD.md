# Product Requirements: CompletePoolApp

Status: Complete

## Problem
A pool-service company runs scheduling, crew tasks, materials, billing and estimates across spreadsheets and messages. The app puts the whole business in one place, with a web app for the office and a mobile app for workers.

## Target users and roles
- **OWNER**: read-only everywhere except user management (`/users`).
- **ADMIN**: runs the business day to day: scheduling, billing, estimates, materials, KPIs.
- **WORKER**: uses the Expo mobile app to see assigned tasks, complete them and add photos.
- Customer: the user's own single pool-service company (single tenant). A public read-only demo login exists on the live site.

## Goals and success metrics
- Jobs completed on schedule (share of scheduled jobs finished on their business day).
- Time from job done to invoice sent.
- Worker adoption of the mobile app (tasks completed and photos added in-app).
- Material stock accuracy (stock decremented exactly once per job).

## MVP features (prioritized)
- **P0**: Scheduling with recurring jobs (calendar, recurrence cron).
- **P0**: Worker tasks and photos on mobile (photos optional, 183-day retention).
- **P1**: Materials and stock tracking.
- **P1**: Billing, invoices, receipts and estimates (PDF). No tax on bills; billed jobs are locked.
- **P1**: KPIs and notifications (live via SSE).

## Out of scope
- iOS app (deferred; Android APK only for now).

## Key user stories / flows
- Admin schedules a job (one-off or recurring) and assigns a worker.
- Worker opens the task on mobile, completes it, optionally attaches photos.
- Completing a job decrements material stock once.
- Admin bills the completed job, generates an invoice/receipt PDF; the job locks.
- Admin creates an estimate PDF for a prospective job.
- Owner reviews KPIs and manages users.

## Constraints
- Platforms: web (Next.js 14) and Android APK (Expo).
- Language: English only.
- Deadline: none fixed.
- Budget: free or low-cost tiers (Vercel, Supabase, OTA updates).

## Risks
- Migration history drift: `_prisma_migrations` holds an uncommitted migration, so `prisma migrate dev` would reset the database. Use `prisma migrate deploy` only.
