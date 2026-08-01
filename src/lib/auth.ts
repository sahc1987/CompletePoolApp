import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import {
  clearFailures,
  clearSourceFailures,
  clientIp,
  isLockedOut,
  isSourceBlocked,
  recordFailure,
  recordSourceFailure,
} from "./loginThrottle";

// Re-exported for the callers that already import the policy from here.
export { MAX_LOGIN_ATTEMPTS, LOCKOUT_SECONDS } from "./loginThrottle";

/**
 * How long a JWT may assert a role before it's checked against the database.
 * Role and `active` are baked into the token at sign-in; without this the token
 * keeps its privileges for the full session lifetime, so disabling or demoting
 * someone wouldn't take effect until they next signed in — which a dismissed
 * employee has no reason to do.
 */
const REVALIDATE_MS = 60_000;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        const ip = clientIp(req?.headers ?? {});

        // Throttle first, and by the address typed rather than by account.
        // Checking the user before the lock would let response timing separate
        // "no such address" from "locked out".
        if (await isLockedOut(email)) return null;
        // The per-account lock can't see a spray — one password against forty
        // addresses leaves every account on a single failure. This can.
        if (await isSourceBlocked(ip)) return null;

        const fail = async () => {
          await Promise.all([recordFailure(email), recordSourceFailure(ip)]);
          return null;
        };

        const user = await prisma.user.findUnique({ where: { email } });

        // Unknown address, disabled account and wrong password all take the
        // same branch: one strike, one null. Nothing distinguishes them.
        if (!user?.active) return fail();
        if (!(await bcrypt.compare(credentials.password, user.passwordHash))) {
          return fail();
        }

        await Promise.all([clearFailures(email), clearSourceFailures(ip)]);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.checkedAt = Date.now();
        return token;
      }

      // Existing session: re-read the account periodically so a demotion or a
      // deactivation lands within REVALIDATE_MS instead of at next sign-in.
      if (Date.now() - (token.checkedAt ?? 0) < REVALIDATE_MS) return token;

      const fresh = await prisma.user.findUnique({
        where: { id: token.id },
        select: { role: true, active: true },
      });
      token.checkedAt = Date.now();
      if (!fresh?.active) {
        // Deleted or disabled. Strip the privileges too, so anything that
        // somehow reads past `revoked` still gets nothing useful.
        token.revoked = true;
        return token;
      }
      token.revoked = false;
      token.role = fresh.role;
      return token;
    },
    async session({ session, token }) {
      // Hand back an empty object for a revoked account. next-auth treats a
      // zero-key body as "no session", so getServerSession returns null and
      // every `if (!session) redirect("/login")` in the app fires — no caller
      // has to remember to test a flag.
      if (token.revoked) return {} as typeof session;

      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
      }
      return session;
    },
  },
};
