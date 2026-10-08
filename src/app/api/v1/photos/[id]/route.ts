import { requireApi } from "@/server/api/auth";
import { apiNoContent, handle, serviceError } from "@/server/api/respond";
import { deletePhoto } from "@/server/services/photos";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/photos/:id
 *
 * Removes a photo and the object behind it — a worker retaking a bad shot
 * before submitting, or an admin tidying up. Refused once the job is approved,
 * since its photos are then part of what was billed.
 */
export const DELETE = handle(async (req, { params }) => {
  const auth = await requireApi(req, { roles: ["WORKER", "ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const result = await deletePhoto(auth.actor, { photoId: params.id });
  if (!result.ok) return serviceError(result);
  return apiNoContent();
});
