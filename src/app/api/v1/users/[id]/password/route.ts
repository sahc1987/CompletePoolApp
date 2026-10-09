import { resetUserPasswordSchema } from "@/contracts/users";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { resetUserPassword } from "@/server/services/users";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/users/:id/password { password } — admin and owner, for accounts
 * they outrank. Signs the person out everywhere and tells them it happened.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, resetUserPasswordSchema.omit({ userId: true }));
  if (!body.ok) return body.response;

  const result = await resetUserPassword(auth.actor, { userId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
