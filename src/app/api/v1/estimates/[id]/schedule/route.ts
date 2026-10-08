import { scheduleEstimateSchema } from "@/contracts/estimates";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { scheduleEstimate } from "@/server/services/estimates";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/:id/schedule
 *
 * Admin only. Turns a signed estimate into a job, with the same hours and
 * double-booking checks as any new job. Returns { taskId }.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, scheduleEstimateSchema.omit({ estimateId: true }));
  if (!body.ok) return body.response;

  return respond(
    await scheduleEstimate(auth.actor, { estimateId: params.id, ...body.data }),
    201
  );
});
