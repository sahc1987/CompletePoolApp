import { waterTestFieldsSchema } from "@/contracts/waterTest";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, parseBody, respond, serviceError } from "@/server/api/respond";
import { getTaskWaterTest, saveWaterTest } from "@/server/services/waterTests";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tasks/:id/water-test
 *
 * The job's reading, or null if none was recorded. A worker gets their own
 * jobs' only (someone else's answers 404); admin and owner get any.
 */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER", "ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  return respond(await getTaskWaterTest(auth.actor, params.id));
});

/**
 * PUT /api/v1/tasks/:id/water-test — a worker records the visit's readings.
 *
 * PUT, not POST: it replaces the job's reading, so the app can send the same
 * request again after a dropped connection and get the same result. Body: any
 * of { freeChlorine, ph, alkalinity, cyanuricAcid }, at least one.
 */
export const PUT = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, waterTestFieldsSchema);
  if (!body.ok) return body.response;

  const result = await saveWaterTest(auth.actor, { taskId: params.id, ...body.data });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
