import { requireApi } from "@/server/api/auth";
import { handle, serviceError } from "@/server/api/respond";
import { pdfResponse } from "@/server/api/pdf";
import { renderInvoicePdf } from "@/server/services/billDocuments";

export const dynamic = "force-dynamic";
// react-pdf needs Node, not the edge runtime.
export const runtime = "nodejs";

/** GET /api/v1/bills/:id/invoice — admin and owner: the invoice as a PDF. */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  const result = await renderInvoicePdf(auth.actor, params.id, new URL(req.url).origin);
  if (!result.ok) return serviceError(result);
  return pdfResponse(result.data);
});
