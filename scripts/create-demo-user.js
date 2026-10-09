#!/usr/bin/env node
/**
 * Create (or refresh) the public read-only demo account behind the login
 * page's "Explore the demo" button.
 *
 *   node scripts/create-demo-user.js
 *
 * - The account is demo@completepool.app, an ADMIN that src/lib/demo.ts makes
 *   read-only at every door a change goes through.
 * - Its password is DEMO_LOGIN_PASSWORD from .env. If that isn't set, one is
 *   generated and written there. The password is shown on the public login
 *   page, so printing it here is fine. Set the same value in Vercel to turn
 *   the button on in production.
 * - Running it again resets the password and re-enables the account, which is
 *   also how to recover if someone has locked it with wrong guesses.
 *
 * This WRITES to whatever database DATABASE_URL points at, which is the live one.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const DEMO_EMAIL = "demo@completepool.app"; // must match src/lib/demo.ts
const ENV_FILE = path.join(__dirname, "..", ".env");

function readEnv(key) {
  const text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const m = text.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?\\s*$`, "m"));
  return m ? m[1].trim() : "";
}

function writeEnv(key, value) {
  const text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const sep = text === "" || text.endsWith("\n") ? "" : eol;
  fs.writeFileSync(ENV_FILE, `${text}${sep}${key}="${value}"${eol}`);
}

async function main() {
  let password = readEnv("DEMO_LOGIN_PASSWORD");
  if (!password) {
    // Readable, since people will type it on a phone: demo-xxxx-xxxx.
    const part = () => crypto.randomBytes(3).toString("hex").slice(0, 4);
    password = `demo-${part()}-${part()}`;
    writeEnv("DEMO_LOGIN_PASSWORD", password);
    console.log("Generated DEMO_LOGIN_PASSWORD and saved it to .env.");
  }
  if (password.length < 8) throw new Error("DEMO_LOGIN_PASSWORD must be at least 8 characters.");

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: { role: "ADMIN", active: true, passwordHash },
      create: { email: DEMO_EMAIL, name: "Demo Admin", role: "ADMIN", active: true, passwordHash },
    });
    // A lockout from someone guessing would block the button too; clear it.
    await prisma.loginAttempt.deleteMany({ where: { email: DEMO_EMAIL } }).catch(() => {});
    console.log(`Demo account ready: ${user.email} / ${password}`);
    console.log("Set DEMO_LOGIN_PASSWORD to the same value in Vercel and redeploy to show the button.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
