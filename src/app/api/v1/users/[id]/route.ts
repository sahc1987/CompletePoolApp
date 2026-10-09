import { requireApi } from "@/server/api/auth";
import { apiError, apiOk, handle, serviceError } from "@/server/api/respond";
import { getTeamMember } from "@/server/services/userReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/users/:id — admin and owner: the person, their pay-rate history
 * and their last eight weeks of hours and pay, cut in the business timezone.
 */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  const result = await getTeamMember(auth.actor, params.id);
  if (!result.ok) return serviceError(result);
  if (!result.data) return apiError("NOT_FOUND", "User not found.");
  return apiOk(result.data);
});
