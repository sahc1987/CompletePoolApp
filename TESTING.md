# Testing: CompletePoolApp

Status: Complete

## Test levels
- **Unit**: pure logic (timezone, privileges, serializers, recurrence, money math).
- **Integration (service level)**: services called with a mocked Prisma; no database is ever needed.
- **E2E / visual**: manual Playwright checks of the web app. Not automated in CI.

## Tools per level
- Web: Jest (`npm test`; excludes `mobile/`). Default environment is jsdom; pure-logic and service suites start with `/** @jest-environment node */`.
- Mobile: jest-expo (`cd mobile && npm test`), `npm run typecheck`, `npm run bundle:check`.
- Manual e2e: Playwright MCP. Save screenshots only to `.playwright-screenshots/` and delete them (and `test-results/`) after the check; never delete images that were in the repo before.

## What must always be tested
- Authorization and role guards: `assertRole`, the privilege ladder, the last-active-manager guard, and demo-user read-only behavior.
- Stock decrement exactly once per job, and cancel reversing stock.
- Billing math and locking: totals, partial payments, reversals, billed jobs locked.
- Timezone and `dayKey`/`businessDay` logic in the business timezone, not the server clock.
- Every bug fix gets a regression test.

## Coverage target
80% line coverage, as a CI gate once CI exists (new code should meet it too). Coverage is reported with `npx jest --coverage`.

## Test data and fixtures
Mock Prisma, never a real database:
```ts
jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
```
Seed only the calls a test asserts on. Service tests also mock `@/lib/notify`. Tests live in `__tests__/` beside the code they cover.

## CI pipeline and when tests run
There are no CI workflows in the repo yet. To add: GitHub Actions on every push to `master` running `npx tsc --noEmit`, `npm test -- --coverage` (fail under 80%), and the mobile typecheck, tests and `bundle:check`. Until then, run them locally before every commit.

## Definition of done for tests
- `npx tsc --noEmit` and `npm test` pass; mobile checks pass when `mobile/` changed.
- New behavior and bug fixes have tests, including the forbidden/denied path for any new service.
- Nothing touches the production database during tests.
- Playwright artifacts are cleaned up.
