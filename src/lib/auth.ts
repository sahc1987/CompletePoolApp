import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// Lockout policy, shared with the login page so the UI can't drift from what
// the server actually enforces.
export const MAX_LOGIN_ATTEMPTS = 3;
export const LOCKOUT_SECONDS = 30;

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });
        if (!user?.active) return null;

        // Locked out: refuse even a correct password until the window passes.
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!valid) {
          // The lock window may have just expired, in which case lockedUntil is
          // stale and the stored count already sits at 0 — so this simply counts
          // up again from wherever the last round left off.
          const attempts = user.failedLoginAttempts + 1;
          const lock = attempts >= MAX_LOGIN_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: lock
              ? {
                  // Reset the counter alongside the lock so the next round gets
                  // a full set of attempts rather than locking on every try.
                  failedLoginAttempts: 0,
                  lockedUntil: new Date(Date.now() + LOCKOUT_SECONDS * 1000),
                }
              : { failedLoginAttempts: attempts },
          });
          return null;
        }

        // Successful sign-in clears any accumulated strikes.
        if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
      }
      return session;
    },
  },
};
