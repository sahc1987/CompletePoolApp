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
- **Billing**: bills by status; recording cash, check or card payments, full or partial; undoing payments with a reason; sending the card pay link; and emailing the invoice (PDF + pay link) to the client from **Email invoice**, which needs email connected in the web Settings → Email.
- **Invoices and receipts** are rendered on the server from the same design the web uses (`src/lib/pdf/billingDocs.tsx`). They open in the share sheet via `expo-sharing`.
- **The owner** reads billing and shares documents but can't move money.

More dashboard tiles, each with the same access as on the web:
- **Materials** (admin): the crew's requests, which an admin approves or denies with a note; the stock list, with low stock flagged; restocks and adjustments, each logged; and adding, editing or retiring materials.
- **Team** (admin and owner, only for accounts they outrank): add people, and change role, pay and dates. Disable accounts, which signs them out everywhere, and reset passwords. Each person also shows eight weeks of hours and pay.
- **Settings** (admin): business hours and timezone, services, add-ons, and tax rates (switched on or off). Each service has a checklist editor (one item per line) on its edit screen. Email and reminder setup are web-only, because the Gmail app password is typed once, on a computer.
- **Reviewing a job** also shows the worker's checklist (which items were ticked) and water-test readings, with out-of-range values marked. **A client's page** shows each pool's latest water tests.
- **Numbers** (owner): revenue, margin, on-time rate, signed estimates, and figures per worker and per material.

The web has no screen for editing company identity, so the app doesn't either.

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

## Installing it on the crew's phones

**Android:** a direct-install APK built on EAS, shared with the crew by link. There's no Play Store involved.
- **iPhone:** waits on an Apple Developer account. Until then iPhone users run it in Expo Go.
- **App ID:** `com.completepool.app` on both platforms.

**First time only**, run `npx eas-cli init` to link this folder to the Expo account. It writes the project id into `app.json`.

To build and hand out the app:

```bash
npm run build:android   # an installable .apk; EAS prints a link and QR code
```

Send the crew the link. On first install, Android asks to allow installs from that browser.

**Fixes over the air.** JavaScript-only changes (screens, text, logic) reach installed phones without a new APK:

```bash
npm run update          # publishes to the "production" channel
```

Phones pick an update up on their next launch or two.

To check the newest code is already published (needs `npx eas-cli login`):

```bash
npm run update:check    # lists commits to mobile/ or the contracts that no update has yet
```

**When a new APK is needed:** a new native module or a config-plugin change needs a new build. Bump `version` in `app.json` first.
- `runtimeVersion` follows the app version, so an update is never sent to a build that can't run it.

The production API address is in `app.json` (`extra.apiUrl`), not in `.env`. Builds and updates run on Expo's servers, which never see the git-ignored `.env`. `EXPO_PUBLIC_API_URL` still overrides it for local testing.

`.npmrc` turns on `legacy-peer-deps` so the build servers install the same way a local `npm install --legacy-peer-deps` does.

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

### Checklist (workers)

`src/features/checklist/ChecklistCard.tsx`, shown on a started job whose service has a checklist. Ticks save by themselves shortly after the last tap and when the screen is left, through the offline outbox (ticking again before it sends replaces the queued one). The checklist travels in the job list (`WorkerTask.checklist`), so it works offline from the saved copy. It's a reminder: the submit confirmation says how many items are unticked, but never blocks. Admins write each service's list in Settings; unticked items show on the review queue.

### Water test (workers)

`src/features/waterTest/WaterTestCard.tsx`, shown on a job once it is started. Free chlorine, pH, total alkalinity and stabilizer; any can be left blank. A value outside the target range is flagged as it is typed (ranges and the check are `@contracts/waterTest`, shared with the server). Nothing is blocked and no dose is suggested. Admins see each pool's history on the web client page and through `GET /api/v1/pools/:id/water-tests`.

### Working with no signal (workers)

`src/offline/outbox.ts`. With no signal a worker can still open today's jobs
(a saved copy of the last list and material catalog), start a job, submit it,
and take before/after photos. Each of those is queued on the phone and sent,
oldest first, when signal returns (`useOutboxSync` retries on launch, on
returning to the app, and every 30 seconds). The list shows how many changes
are waiting; a change the server refuses on replay (say an admin cancelled the
job meanwhile) is shown once on the list with the reason, then dismissed.

- "Offline" means the request never reached the server (`ApiError` OFFLINE,
  status 0). There is no network-status module: it would need a new APK, and
  this ships over the air. Add one if 30-second polling proves too slow.
- Replays are safe because the server treats a repeated `start`/`submit` as
  done (`src/server/services/worker.ts`) — stock is never counted twice.
- Files are per signed-in user, in the app's document directory.
- Known limit: the day headings ("Today", "Tomorrow") come from the saved copy,
  so a phone offline past midnight shows yesterday's grouping until it
  reconnects. The app does no date arithmetic, by design.
- Also queued: the visit's water test (four readings; saving again before it sends replaces the queued one).
- Not queued: material requests and on-site estimates still need signal.

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
