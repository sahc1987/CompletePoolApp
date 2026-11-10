# Code Style: CompletePoolApp

Status: Complete

## Language and strictness
TypeScript with `strict` on, for web and mobile. `npx tsc --noEmit` must pass; it also enforces enum parity between Prisma and `src/contracts/enums.ts`. Mobile: `cd mobile && npm run typecheck`. Do not use `any` without a comment explaining why.

## Lint and format tools
- Type check (`tsc`) is the gate; there is no lint script.
- Prettier is the formatter. Adding the dependency and a `format` script is still to do; until then match the surrounding file.
- zod is pinned to 3.x; do not run `expo install zod`.

## Naming conventions
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components, `*Reads.ts` for read-side services, `actions.ts` for server actions, `route.ts` for REST handlers.
- Variables and functions `camelCase`, types and components `PascalCase`, constants `UPPER_SNAKE_CASE`.
- Prisma models `PascalCase`, enums `PascalCase` with `UPPER_SNAKE` values.

## Folder structure
- `src/server/services/*`: all business rules (with `__tests__/` beside them).
- `src/app/*/actions.ts` and `page.tsx`: web adapters; `src/app/api/v1/**/route.ts`: REST adapters.
- `src/contracts/*`: shared Zod schemas; must not import `@prisma/client` or `next`.
- `src/lib/*`: helpers (`guard.ts`, `timezone.ts`, `formData.ts`, `privileges.ts`).
- `mobile/`: Expo app with its own tsconfig/jest/metro config.

## Error handling pattern
Services take an explicit `Actor`, re-check access with `assertRole`, and return `ServiceResult` instead of throwing. Adapters map results: actions return `ActionState` (`{ error }` / `{ ok: true }`); REST routes use `handle()`, `respond()` and `serviceError()` with the `{ error: { code, message } }` envelope (VALIDATION 400, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, STATE 422). Error messages are shown verbatim to users, so write them for people.

## Commit convention
Conventional Commits: `type(scope): summary`, e.g. `feat(map): ...`, `fix(package): ...`, `docs(readme): ...`. Subject in the imperative, no trailing period.

## Branching and PR rules
Commit directly to `master`; no feature branches or required PRs. Before every commit run `npx tsc --noEmit` and `npm test`; for mobile changes that touch imports also run `npm run bundle:check`. Ask before any migration, seed or write to the live database.

## Comments and docs rules
Comment the why (business rules, traps, units, timezone assumptions), not the what. Don't leave commented-out code. Keep these 8 docs, `README.md` and `CLAUDE.md` in step with behavior changes.
