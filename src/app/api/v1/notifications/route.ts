import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildNotificationPayload } from "@/lib/notifications";
import { requireApi } from "@/server/api/auth";
import { apiNoContent, apiOk, handle, parseBody } from "@/server/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications
 *
 * The same payload the web bell renders: recent notifications, the unread
 * count, and a summary of the work assigned to the caller (or to the team, for
 * a manager).
 *
 * The web gets this pushed over SSE. The app polls it instead — React Native
 * has no native EventSource, and iOS suspends sockets when an app is
 * backgrounded, so a held-open stream is not a connection a phone can keep.
 * Call it on foreground and on pull-to-refresh.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  return apiOk(await buildNotificationPayload(auth.actor));
});

const markReadSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(z.string().min(1)).optional(),
});

/**
 * POST /api/v1/notifications
 *
 * Mark notifications read. Scoped to the caller's own rows by the query, so a
 * client cannot mark someone else's bell clear by guessing ids.
 */
export const POST = handle(async (req) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, markReadSchema);
  if (!body.ok) return body.response;

  await prisma.notification.updateMany({
    where: {
      userId: auth.actor.id,
      read: false,
      ...(body.data.ids ? { id: { in: body.data.ids } } : {}),
    },
    data: { read: true },
  });

  return apiNoContent();
});
