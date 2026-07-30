# Deploying: Supabase (database) + Vercel (app)

Supabase hosts the Postgres database. Vercel hosts the Next.js app and runs the
recurrence cron. The two are configured independently.

---

## 1. Create the Supabase project

1. Sign up at <https://supabase.com> and click **New project**.
2. Name it (e.g. `pool-company`), pick the region closest to your users, and set
   a **database password** — copy it somewhere safe, it is shown only once.
3. Wait ~2 minutes for provisioning.

## 2. Get the two connection strings

In the dashboard: **Project Settings -> Database -> Connection string**, and
select the **URI** tab. You need two variants:

| Env var        | Supabase option              | Port | Used by            |
| -------------- | ---------------------------- | ---- | ------------------ |
| `DATABASE_URL` | Transaction pooler           | 6543 | the app at runtime |
| `DIRECT_URL`   | Session pooler               | 5432 | `prisma migrate`   |

Replace `[YOUR-PASSWORD]` in each with the password from step 1, and append
`?pgbouncer=true&connection_limit=1` to `DATABASE_URL`.

Two connections are required because Prisma migrations cannot run through
pgbouncer, while serverless functions must use the pooler to avoid exhausting
connections. See [schema.prisma](prisma/schema.prisma).

## 3. Apply the schema

Put both URLs in your local `.env` (see [.env.example](.env.example)), then:

```bash
npx prisma migrate deploy   # applies the 5 migrations in prisma/migrations
npm run prisma:seed         # optional: initial data
npm run dev                 # verify the app works against Supabase
```

Confirm the tables exist under **Table Editor** in the dashboard.

## 4. Push the code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env` is gitignored — verify with `git status` that it is not staged.

## 5. Deploy to Vercel

1. At <https://vercel.com> choose **Add New -> Project** and import the repo.
   Next.js is detected automatically; leave the build settings alone.
2. Before the first deploy, add these **Environment Variables**:

   | Name              | Value                                            |
   | ----------------- | ------------------------------------------------ |
   | `DATABASE_URL`    | pooled string from step 2                        |
   | `DIRECT_URL`      | direct string from step 2                        |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` (a **new** one)        |
   | `NEXTAUTH_URL`    | your deployed URL, e.g. `https://app.vercel.app` |
   | `CRON_SECRET`     | another `openssl rand -base64 32`                |
   | `TZ`              | `America/New_York` — **required**, see below      |

3. Deploy. `npm run build` runs `prisma generate` first, so the client is
   generated against the deployed schema.
4. `NEXTAUTH_URL` is a chicken-and-egg case: you only learn the real URL after
   the first deploy. Set it afterwards and redeploy — logins fail until it
   matches the actual origin.

## 6. Cron

[vercel.json](vercel.json) registers `/api/cron/recurrence` to run daily at
06:00 UTC. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`,
which is exactly what [the route](src/app/api/cron/recurrence/route.ts) checks —
so no extra wiring is needed, but the cron will 401 if `CRON_SECRET` is unset on
Vercel while set in code, or vice versa.

Hobby-plan projects are limited to daily cron granularity.

## Ongoing: schema changes

```bash
npm run prisma:migrate       # locally: creates the migration
git push                     # Vercel rebuilds
npx prisma migrate deploy    # apply to Supabase (uses DIRECT_URL)
```

Run `migrate deploy` against production yourself, or add it to the Vercel build
command — never run `migrate dev` against Supabase, it can drop data.

## Timezone

Set it in the app: **Settings → Business hours → Timezone**. It defaults to
`America/New_York` and is stored in the database, so it survives redeploys and
needs no environment variable.

Everything time-related is interpreted against that zone rather than the
server's clock — job start times, the business-hours check, "today" in the
notification bell, the Monday boundaries in the weekly hours report, and the
recurrence expansion. That matters because Vercel runs in UTC: before this was
pinned, a job entered as 11:00 AM was stored as 11:00 UTC and displayed as
7:00 AM Eastern.

`BUSINESS_TZ` in the environment only supplies the fallback used before the
settings row exists; you do not need to set it.

One deliberate exception: the FullCalendar grid renders in the **viewer's**
browser timezone, because named timezones there need an extra plugin. For anyone
physically in the business timezone these are the same. The summary under the
calendar and the edit dialog are always rendered in the business timezone.

## Notes

- **Free-tier pausing:** unused Supabase projects pause after ~1 week of
  inactivity and need a manual resume from the dashboard.
- **Connection limits:** if you see `too many connections`, confirm the app is
  using the port-6543 pooled URL with `connection_limit=1`.
- Supabase Auth is *not* used — this app authenticates with NextAuth against its
  own `User` table ([auth.ts](src/lib/auth.ts)). Supabase is only the database.
