import { confirmPhotoUploadSchema } from "@/contracts/photos";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { confirmPhotoUpload, listTaskPhotos } from "@/server/services/photos";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tasks/:id/photos
 *
 * The job's before/after photos, each with a short-lived signed URL. The URLs
 * expire within the hour, so a client should fetch this when it renders rather
 * than cache it.
 */
export const GET = handle(async (req, { params }) => {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  return respond(await listTaskPhotos(auth.actor, params.id));
});

/**
 * POST /api/v1/tasks/:id/photos
 *
 * Records a photo whose bytes are already in storage. Body: { type, path },
 * where `path` is the one handed out by the upload-url call.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER", "ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, confirmPhotoUploadSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  return respond(
    await confirmPhotoUpload(auth.actor, { taskId: params.id, ...body.data }),
    201
  );
});
