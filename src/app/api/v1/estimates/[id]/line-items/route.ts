import { addLineItemSchema } from "@/contracts/estimates";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { addLineItem } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/** POST /api/v1/estimates/:id/line-items — body { description, quantity, unitPrice }. Drafts only. */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, addLineItemSchema.omit({ estimateId: true }));
  if (!body.ok) return body.response;

  return respond(
    await addLineItem(auth.actor, { estimateId: params.id, ...body.data }),
    201
  );
});
