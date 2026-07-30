import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Route -> roles allowed to access it. Anything not listed just needs a valid session.
const ROUTE_RULES: { prefix: string; roles: Array<"OWNER" | "ADMIN" | "WORKER"> }[] = [
  { prefix: "/clients", roles: ["ADMIN"] },
  { prefix: "/assign", roles: ["ADMIN"] },
  { prefix: "/review", roles: ["ADMIN"] }, // approve/flag submitted tasks
  { prefix: "/materials", roles: ["ADMIN"] }, // catalog, stock, and request inbox
  { prefix: "/estimates", roles: ["ADMIN", "WORKER"] }, // create + present + capture signature, either role
  { prefix: "/settings", roles: ["ADMIN"] }, // tax rates, services, extras catalog
  { prefix: "/kpi", roles: ["OWNER"] },
  // Team + privileges. Both managers administer accounts; note this is the one
  // place OWNER is not read-only.
  { prefix: "/users", roles: ["ADMIN", "OWNER"] },
  { prefix: "/worker", roles: ["WORKER"] },
  { prefix: "/billing", roles: ["ADMIN", "OWNER"] }, // bills + payments
];

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role as "OWNER" | "ADMIN" | "WORKER" | undefined;

    const rule = ROUTE_RULES.find((r) => pathname.startsWith(r.prefix));
    if (rule && (!role || !rule.roles.includes(role))) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/clients/:path*",
    "/assign/:path*",
    "/review/:path*",
    "/materials/:path*",
    "/estimates/:path*",
    "/settings/:path*",
    "/kpi/:path*",
    "/users/:path*",
    "/worker/:path*",
    "/calendar/:path*",
    "/billing/:path*",
    "/account/:path*", // any signed-in user; no role rule, just requires a session
  ],
};
