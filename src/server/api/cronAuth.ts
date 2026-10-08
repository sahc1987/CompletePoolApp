/**
 * Shared guard for the cron entry points.
 *
 * Both jobs mutate data and are reachable by anyone who knows the URL, so they
 * check the same shared secret the same way. Extracted because a second copy is
 * where one of them quietly stops checking.
 *
 * The header form is what Vercel Cron sends; `?key=` exists so the job can be
 * triggered by hand or by a scheduler that can't set headers.
 */
export function cronRequestAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Unset means an unguarded endpoint — deliberate, so the app runs with no
  // configuration in development.
  if (!secret) return true;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  return new URL(req.url).searchParams.get("key") === secret;
}
