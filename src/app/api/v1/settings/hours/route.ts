import { saveWorkHoursSchema } from "@/contracts/settings";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, serviceError } from "@/server/api/respond";
import { saveWorkHours } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/**
 * PUT /api/v1/settings/hours { workdayStart: "HH:MM", workdayEnd, timezone }
 * — admin. The timezone moves the whole app's clock.
 */
export const PUT = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, saveWorkHoursSchema);
  if (!body.ok) return body.response;

  const result = await saveWorkHours(auth.actor, body.data);
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
