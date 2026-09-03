const nextJest = require("next/jest");

// next/jest wires up SWC (so TS/JSX compile with the same settings as the app),
// next.config.js, the tsconfig `@/*` alias, and CSS/image stubs.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // tsconfig has no `baseUrl`, which is all Next needs but not enough for
  // next/jest to derive the alias, so map `@/…` explicitly.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Components are the common case; pure-logic suites opt out with a
  // `@jest-environment node` docblock at the top of the file.
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/**/layout.tsx",
    "!src/app/**/page.tsx",
  ],
  clearMocks: true,
};

module.exports = createJestConfig(config);
