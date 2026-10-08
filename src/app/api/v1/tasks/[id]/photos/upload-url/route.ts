import { requestPhotoUploadSchema } from "@/contracts/photos";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { requestPhotoUpload } from "@/server/services/photos";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tasks/:id/photos/upload-url
 *
 * Body: { type: "BEFORE" | "AFTER", contentType }
 * Returns: { uploadUrl, path, expiresInSeconds, type }
 *
 * The device then PUTs the image bytes straight to `uploadUrl` with a matching
 * content-type header, and calls POST .../photos to record it.
 *
 * The bytes deliberately do not pass through here: a serverless function caps
 * a request body at 4.5MB, which a phone photo clears routinely.
 */
export const POST = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER", "ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, requestPhotoUploadSchema.omit({ taskId: true }));
  if (!body.ok) return body.response;

  return respond(
    await requestPhotoUpload(auth.actor, { taskId: params.id, ...body.data })
  );
});
