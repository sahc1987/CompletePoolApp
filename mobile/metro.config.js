const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * Metro has to reach outside this project to `../src/contracts`, which holds
 * the Zod schemas the API validates against. Sharing them is the point: a
 * screen that posts the wrong shape should fail to compile here rather than
 * 400 at runtime.
 *
 * Two settings are needed and neither is the default:
 *
 *   watchFolders     — Metro refuses to serve a file outside the project root,
 *                      so the contracts directory has to be declared.
 *   nodeModulesPaths — a file in ../src/contracts resolves `zod` from its own
 *                      ancestors, which is the repo root's node_modules. Listing
 *                      this project first keeps both bound to one copy, and the
 *                      two are pinned to the same version for the same reason.
 *
 * Half-configured, this fails as "Unable to resolve module" with no hint that
 * the cause is a path boundary.
 *
 * Note what is deliberately *not* set: `disableHierarchicalLookup`. Expo's
 * monorepo guidance recommends it, and it breaks this install — npm did not
 * hoist everything (babel-preset-expo and @expo/metro-runtime both sit nested
 * under expo/node_modules), and those packages can only find their own
 * dependencies by walking up. This is one app beside one web project, not a
 * workspace, so the hoisting that setting assumes never happened.
 */
const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const contractsRoot = path.resolve(repoRoot, "src/contracts");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [contractsRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

module.exports = config;
