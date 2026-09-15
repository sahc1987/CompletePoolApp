import { requireApi } from "@/server/api/auth";
import { apiError, handle, respond } from "@/server/api/respond";
import {
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
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;
  const { actor } = auth;

  const requested = new URL(req.url).searchParams.get("view");
  const view = requested ?? (actor.role === "WORKER" ? "mine" : "calendar");

  switch (view) {
    case "mine":
      return respond(await listMyTasks(actor));
    case "calendar":
      return respond(await listCalendarTasks(actor));
    case "review":
      return respond(await listReviewQueue(actor));
    default:
      return apiError(
        "VALIDATION",
        "view must be one of: mine, calendar, review."
      );
  }
});
