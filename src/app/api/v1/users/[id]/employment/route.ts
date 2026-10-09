import { saveEmploymentSchema } from "@/contracts/users";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { saveEmployment } from "@/server/services/users";

export const dynamic = "force-dynamic";

/**
 * PUT /api/v1/users/:id/employment { hourlyRate, hiredOn?, birthday?, note? }
 * — admin and owner, for accounts they outrank. A changed rate is logged.
 */
export const PUT = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, saveEmploymentSchema.omit({ userId: true }));
  if (!body.ok) return body.response;

  const result = await saveEmployment(auth.actor, { userId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
