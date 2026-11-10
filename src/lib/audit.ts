/**
 * Security event log. One JSON line per event to stdout (Vercel logs).
 * Callers pass ids and IPs only: never passwords, tokens, emails or other PII.
 */
export type AuditEvent =
  | "login_failed"
  | "login_locked"
  | "password_changed"
  | "permission_denied";

export function audit(
  event: AuditEvent,
  fields: { userId?: string | null; ip?: string | null; detail?: string } = {}
): void {
  console.warn(
    JSON.stringify({ audit: event, at: new Date().toISOString(), ...fields })
  );
}
