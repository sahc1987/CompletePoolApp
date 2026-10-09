import { DEMO_EMAIL, demoPassword } from "@/lib/demo";
import { apiOk, handle } from "@/server/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/demo — public. The read-only demo account's sign-in while
 * the demo is switched on (DEMO_LOGIN_PASSWORD), or null while it's off, so
 * the app's sign-in screen shows the same "Explore the demo" offer as the web
 * login page. Publishing it is the point: the account can't change anything
 * (see lib/demo.ts).
 */
export const GET = handle(async () => {
  const password = demoPassword();
  return apiOk(password ? { email: DEMO_EMAIL, password } : null);
});
