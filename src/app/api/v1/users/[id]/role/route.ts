import { setUserRoleSchema } from "@/contracts/users";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { setUserRole } from "@/server/services/users";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/users/:id/role { role } — admin and owner. Never your own role,
 * never above your rank, never the last active manager (409).
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, setUserRoleSchema.omit({ userId: true }));
  if (!body.ok) return body.response;

  const result = await setUserRole(auth.actor, { userId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
