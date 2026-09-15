import { requireApi } from "@/server/api/auth";
import { apiError, apiOk, handle, serviceError } from "@/server/api/respond";
import {
  getBusinessDay,
  listCalendarTasks,
  listMyTasks,
  listReviewQueue,
} from "@/server/services/taskReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tasks?view=mine|calendar|review
 *
 * Three genuinely different lists rather than one with filters, because they
 * carry different fields and answer different questions:
 *
 *   mine     — a worker's own active jobs, for the day's list
 *   calendar — everything the actor may see, redacted by role
 *   review   — submitted jobs awaiting an admin's decision, with materials
 *
 * `view` defaults to the one that makes sense for the caller's role, so the
 * common case needs no query string at all.
 *
 * Every response carries `businessDay`. A client must group jobs by comparing
 * a task's `dayKey` against `businessDay.today`/`tomorrow` as strings — a
 * phone's own clock is not the business's, and deriving a calendar day from
 * `startTime` on the device puts the crew a day out whenever the two disagree.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;
  const { actor } = auth;

  const requested = new URL(req.url).searchParams.get("view");
  const view = requested ?? (actor.role === "WORKER" ? "mine" : "calendar");

  if (view !== "mine" && view !== "calendar" && view !== "review") {
    return apiError("VALIDATION", "view must be one of: mine, calendar, review.");
  }

  const readers = {
    mine: listMyTasks,
    review: listReviewQueue,
    calendar: listCalendarTasks,
  } as const;

  const tasks = await readers[view](actor);
  if (!tasks.ok) return serviceError(tasks);

  return apiOk({ tasks: tasks.data, businessDay: await getBusinessDay() });
});
