import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import {
  badState,
  forbidden,
  invalid,
  notFound,
  ok,
  type ServiceError,
  type ServiceResult,
} from "@/server/result";
import { requiredIso } from "@/server/serialize";
import {
  PHOTO_RETENTION_DAYS,
  createSignedDownloads,
  createSignedUpload,
  extensionForContentType,
  photoObjectPath,
  photoStorageConfigured,
  removeObjects,
  type SignedUpload,
} from "@/server/storage/photoStorage";
import {
  confirmPhotoUploadSchema,
  deletePhotoSchema,
  requestPhotoUploadSchema,
  type ConfirmPhotoUploadInput,
  type DeletePhotoInput,
  type RequestPhotoUploadInput,
} from "@/contracts/photos";
import type { PhotoTypeValue } from "@/contracts/enums";

/**
 * Before/after photos for a job.
 *
 * `Photo.url` holds the object's path inside the bucket, not a URL. The column
 * predates this feature and a path fits it; a stored URL would embed an
 * expiring signature and be wrong within the hour.
 */

export type TaskPhoto = {
  id: string;
  type: PhotoTypeValue;
  uploadedAt: string;
  /** Short-lived signed URL, or null when the object is missing from storage. */
  url: string | null;
};

/**
 * Who may attach a photo to a job.
 *
 * A worker may photograph their own job while they still have it — before it
 * goes to review, and again if it comes back flagged. An admin may add one to
 * any job, since they close jobs out themselves from the calendar.
 */
type TaskLookup =
  | { ok: true; task: { id: string; workerId: string } }
  | { ok: false; error: ServiceError };

async function loadWritableTask(
  actor: Actor,
  taskId: string
): Promise<TaskLookup> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, workerId: true, status: true },
  });
  if (!task) return { ok: false, error: notFound("Task not found.") };

  if (actor.role === "ADMIN") return { ok: true, task };

  if (actor.role !== "WORKER" || task.workerId !== actor.id) {
    // Same reasoning as the task lifecycle: a worker has no business learning
    // which task ids exist.
    return { ok: false, error: notFound("Task not found.") };
  }

  // An approved job is a closed record. Its photos are evidence of what was
  // billed, so they stop being editable at the same moment the price does.
  if (task.status === "APPROVED" || task.status === "CANCELLED") {
    return {
      ok: false,
      error: badState("This job is closed — photos can't be changed."),
    };
  }

  return { ok: true, task };
}

/** Who may look. A worker sees their own job's photos; managers see any. */
async function loadReadableTask(
  actor: Actor,
  taskId: string
): Promise<TaskLookup> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, workerId: true },
  });
  if (!task) return { ok: false, error: notFound("Task not found.") };

  const isManager = actor.role === "ADMIN" || actor.role === "OWNER";
  if (!isManager && task.workerId !== actor.id) {
    return { ok: false, error: notFound("Task not found.") };
  }
  return { ok: true, task };
}

const unavailable = () =>
  badState("Photo upload isn't set up on this server yet.");

/**
 * Step 1: authorize, then hand back a URL the device uploads straight to.
 *
 * The path is generated here and never taken from the caller, which is what
 * stops a client writing outside its own job's folder.
 */
export async function requestPhotoUpload(
  actor: Actor,
  input: RequestPhotoUploadInput
): Promise<ServiceResult<SignedUpload & { type: PhotoTypeValue }>> {
  const denied = assertRole(actor, "WORKER", "ADMIN");
  if (denied) return denied;
  if (!photoStorageConfigured()) return unavailable();

  const parsed = requestPhotoUploadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, type, contentType } = parsed.data;

  const found = await loadWritableTask(actor, taskId);
  if (!found.ok) return found.error;

  const path = photoObjectPath(
    taskId,
    type,
    extensionForContentType(contentType)
  );

  const signed = await createSignedUpload(path);
  return ok({ ...signed, type });
}

/**
 * Step 3: record the photo, once the device says the bytes are in storage.
 *
 * The path is re-derived from the task rather than trusted: a caller who could
 * name any path could attach an object from another job — or another
 * customer's property — to a job of their own.
 */
export async function confirmPhotoUpload(
  actor: Actor,
  input: ConfirmPhotoUploadInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "WORKER", "ADMIN");
  if (denied) return denied;
  if (!photoStorageConfigured()) return unavailable();

  const parsed = confirmPhotoUploadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, type, path } = parsed.data;

  const found = await loadWritableTask(actor, taskId);
  if (!found.ok) return found.error;

  // Every object this service mints lives under `<taskId>/`. Anything else is
  // a caller naming a path we didn't give them.
  if (!path.startsWith(`${taskId}/`)) {
    return forbidden("That upload doesn't belong to this job.");
  }

  const created = await prisma.photo.create({
    data: { taskId, type, url: path },
  });
  return ok({ id: created.id });
}

export async function listTaskPhotos(
  actor: Actor,
  taskId: string
): Promise<ServiceResult<TaskPhoto[]>> {
  const found = await loadReadableTask(actor, taskId);
  if (!found.ok) return found.error;

  const photos = await prisma.photo.findMany({
    where: { taskId },
    orderBy: [{ type: "asc" }, { uploadedAt: "asc" }],
  });
  if (photos.length === 0) return ok([]);

  // Storage isn't configured, so there are no URLs to sign — but the rows are
  // still real and worth reporting rather than pretending the job has none.
  if (!photoStorageConfigured()) {
    return ok(
      photos.map((p) => ({
        id: p.id,
        type: p.type as PhotoTypeValue,
        uploadedAt: requiredIso(p.uploadedAt),
        url: null,
      }))
    );
  }

  const urls = await createSignedDownloads(photos.map((p) => p.url));

  return ok(
    photos.map((p) => ({
      id: p.id,
      type: p.type as PhotoTypeValue,
      uploadedAt: requiredIso(p.uploadedAt),
      url: urls.get(p.url) ?? null,
    }))
  );
}

/** Remove a photo — a worker retaking a bad shot, or an admin tidying up. */
export async function deletePhoto(
  actor: Actor,
  input: DeletePhotoInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "WORKER", "ADMIN");
  if (denied) return denied;

  const parsed = deletePhotoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const photo = await prisma.photo.findUnique({
    where: { id: parsed.data.photoId },
    select: { id: true, url: true, taskId: true },
  });
  if (!photo) return notFound("Photo not found.");

  const found = await loadWritableTask(actor, photo.taskId);
  if (!found.ok) return found.error;

  // The row goes first. A leftover object costs storage; a row pointing at a
  // deleted object shows a broken photo to whoever looks next.
  await prisma.photo.delete({ where: { id: photo.id } });
  if (photoStorageConfigured()) {
    await removeObjects([photo.url]).catch(() => {
      // The retention job will collect it later.
    });
  }
  return ok();
}

/**
 * Delete photos past the retention window, and the objects behind them.
 *
 * Six months, by decision: photos of customers' properties are not kept
 * indefinitely. Run from the cron endpoint.
 */
export async function purgeExpiredPhotos(): Promise<
  ServiceResult<{ deleted: number }>
> {
  if (!photoStorageConfigured()) return unavailable();

  const cutoff = new Date(
    Date.now() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const expired = await prisma.photo.findMany({
    where: { uploadedAt: { lt: cutoff } },
    select: { id: true, url: true },
    // Bounded so one run can't time out on a long backlog; the next run
    // continues where this left off.
    take: 500,
  });
  if (expired.length === 0) return ok({ deleted: 0 });

  // Objects first here, unlike a single delete: if this run dies halfway, the
  // surviving rows are still expired and the next run retries them. Dropping
  // the rows first would orphan the objects with nothing left pointing at them.
  await removeObjects(expired.map((p) => p.url));
  await prisma.photo.deleteMany({
    where: { id: { in: expired.map((p) => p.id) } },
  });

  return ok({ deleted: expired.length });
}
