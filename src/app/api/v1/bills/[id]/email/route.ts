import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { emailInvoice } from "@/server/services/billEmail";

export const dynamic = "force-dynamic";
// The invoice PDF is rendered here, and react-pdf needs Node, not the edge runtime.
export const runtime = "nodejs";

/**
 * POST /api/v1/bills/:id/email — admin: email the invoice (PDF + pay link) to
 * the client. Answers { sentTo }. 400 when the client has no email address, 422
 * when email isn't set up yet or the mail server refused it.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  return respond(await emailInvoice(auth.actor, params.id));
});
