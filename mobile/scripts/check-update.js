// Is the newest mobile code already published to the phones?
//
//   npm run update:check          report only
//   npm run update:check -- --fail    exit 1 when something is unpublished (for scripts)
//
// Compares the git commit of the latest EAS update on the "production" channel
// with the commits since that touched what the app is built from: mobile/ and
// the shared contracts in ../src/contracts. Needs `npx eas-cli login`.
const { execFileSync } = require("child_process");

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32" }).trim();
const fail = process.argv.includes("--fail");
const finish = (upToDate) => process.exit(fail && !upToDate ? 1 : 0);

// The newest update that carries a git commit. Searched by shape rather than
// by path, so a small change in the CLI's JSON layout doesn't break the check.
function findUpdates(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => findUpdates(n, found));
  else if (node && typeof node === "object") {
    if (node.gitCommitHash && node.createdAt) found.push(node);
    Object.values(node).forEach((n) => findUpdates(n, found));
  }
  return found;
}

let raw;
try {
  raw = run("npx", ["eas-cli", "update:list", "--branch", "production", "--limit", "5", "--json", "--non-interactive"]);
} catch (e) {
  console.error("Couldn't read the published updates. Run `npx eas-cli login` first.\n" + (e.stderr || e.message));
  process.exit(2);
}

const latest = findUpdates(JSON.parse(raw)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
if (!latest) {
  console.log("No update with a git commit found on the production channel. Publish one: npm run update");
  finish(false);
}

const hash = latest.gitCommitHash;
const when = new Date(latest.createdAt).toLocaleString();
let behind;
try {
  behind = run("git", ["log", "--oneline", `${hash}..HEAD`, "--", ".", "../src/contracts"]).split("\n").filter(Boolean);
} catch {
  console.log(`Latest update is ${hash.slice(0, 7)} (${when}), but that commit isn't in this checkout. Pull, or publish: npm run update`);
  finish(false);
}
const dirty = run("git", ["status", "--porcelain", "--", ".", "../src/contracts"]).split("\n").filter(Boolean);

console.log(`Latest published update: ${hash.slice(0, 7)} on ${when}${latest.message ? ` ("${latest.message}")` : ""}`);
if (behind.length === 0 && dirty.length === 0) {
  console.log("Up to date: phones already have the newest mobile code.");
  finish(true);
}
if (behind.length) console.log(`\n${behind.length} commit(s) not published yet:\n  ${behind.join("\n  ")}`);
if (dirty.length) console.log(`\n${dirty.length} uncommitted change(s) in mobile/ or contracts (commit them first):\n  ${dirty.join("\n  ")}`);
console.log("\nPublish with: npm run update");
finish(false);
