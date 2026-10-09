# Complete Pool — mobile

The field app for CompletePoolApp, built with Expo (SDK 57) and expo-router.

This release covers the worker's day: sign in, see today's jobs, start one,
log the material it used, and submit it for review. Workers can also request
materials, and build estimates on site — line items, taxes, presenting, and
the customer's signature on the phone (`react-native-signature-canvas`, which
draws in a `react-native-webview` and returns the same PNG data URL the web pad
does).

Admins and owners get their own side of the app (`app/(manager)`): a
dashboard, the team schedule (week strip + day list; admins create, edit,
reschedule, finish, cancel and end repeating jobs), the review queue with
photos (admins approve or flag), and every worker's route on the map. The
owner sees it read-only, as on the web.

Clients and billing open from the manager dashboard tiles:
- **Clients** (admin only, as on the web): search, details, and adding or editing clients and pools.
- **Billing**: bills by status; recording cash, check or card payments, full or partial; undoing payments with a reason; and sending the card pay link.
- **Invoices and receipts** are rendered on the server from the same design the web uses (`src/lib/pdf/billingDocs.tsx`). They open in the share sheet via `expo-sharing`.
- **The owner** reads billing and shares documents but can't move money.

Materials, team and settings are still web-only (plan phase 7).

## Running it

```bash
cd mobile
npm install
npm start
```

Then scan the QR code with Expo Go, or press `i` / `a` for a simulator.

### Pointing it at a server

`EXPO_PUBLIC_API_URL` is the origin of the Next.js app — the app appends
`/api/v1` itself. It defaults to production; copy `.env.example` to `.env` to
change it.

```
EXPO_PUBLIC_API_URL=https://complete-pool-app.vercel.app
```

To work against a local `npm run dev`, use your machine's **LAN address**, not
`localhost` — on a phone, `localhost` is the phone:

```
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

## Checks

```bash
npm run typecheck     # tsc, including the shared contracts
npm test              # jest-expo
npm run bundle:check  # a real Metro bundle — catches resolution errors tsc can't
```

`bundle:check` is worth running before any commit that touches imports.
TypeScript resolves paths through `tsconfig.json`; Metro resolves them through
`metro.config.js`, and the two can disagree. A bundle is the only thing that
proves the app actually builds.

## How it fits together

```
app/                    expo-router screens (the route tree)
  _layout.tsx           auth provider, theme, stack
  index.tsx             launch gate — routes by role
  sign-in.tsx
  (worker)/             the worker tabs
src/
  api/client.ts         fetch wrapper: bearer token, refresh-on-401
  api/endpoints.ts      every call the app makes
  api/storage.ts        tokens in SecureStore
  auth/AuthContext.tsx  who is signed in
  ui/                   theme, components, useLayout
```

### Shared contracts

Request shapes come from `../src/contracts` — the same Zod schemas the API
validates against, not a copy. Sending the wrong field fails to compile here
rather than 400ing on a pool deck.

That import crosses out of this project, which needs both `watchFolders` and
`nodeModulesPaths` in `metro.config.js`; see the comment there. It also means
`zod` is pinned to the same version as the web app on purpose — two majors of
zod would defeat the point of sharing.

### Things that are the way they are for a reason

- **Dates.** The app never works out what day a job is on. The server sends a
  `dayKey` and a `businessDay`, both in the business's timezone, and the app
  compares them as strings. A phone's clock is not the business's, and a worker
  can drive across a timezone.
- **Refresh is single-flight.** The refresh endpoint rotates the token, so two
  concurrent refreshes would make the second look like a stolen token replay
  and sign the user out. `client.ts` joins a refresh already in progress.
- **SecureStore, never AsyncStorage.** The refresh token is good for 30 days;
  AsyncStorage is a plain file.
