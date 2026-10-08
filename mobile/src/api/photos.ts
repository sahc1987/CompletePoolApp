import { File, UploadType } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { PhotoTypeValue } from "@contracts/enums";
import { ApiError, api } from "./client";

/**
 * Before/after photos: capture, shrink, upload, record.
 *
 * The bytes go straight from the phone to storage and never through the API —
 * a serverless function caps a request body at 4.5MB, which a modern phone
 * photo clears routinely. The server's part is authorizing the upload and
 * recording the result.
 */

export type TaskPhoto = {
  id: string;
  type: PhotoTypeValue;
  uploadedAt: string;
  /** Short-lived signed URL. Null when the object has gone missing. */
  url: string | null;
};

type SignedUpload = {
  uploadUrl: string;
  path: string;
  expiresInSeconds: number;
  type: PhotoTypeValue;
};

export const photos = {
  list: (taskId: string) => api.get<TaskPhoto[]>(`/tasks/${taskId}/photos`),

  requestUpload: (taskId: string, type: PhotoTypeValue, contentType: string) =>
    api.post<SignedUpload>(`/tasks/${taskId}/photos/upload-url`, {
      type,
      contentType,
    }),

  confirm: (taskId: string, type: PhotoTypeValue, path: string) =>
    api.post<{ id: string }>(`/tasks/${taskId}/photos`, { type, path }),

  remove: (photoId: string) =>
    api.del<void>(`/photos/${photoId}`),
};

/**
 * Shrink a camera capture before it leaves the phone.
 *
 * A full-resolution capture is 3–5MB. At 1600px on the long edge and JPEG
 * quality 0.7 the same photo is a few hundred KB — indistinguishable for
 * judging whether a pool is clean, and the difference between an upload that
 * completes on one bar of signal and one that doesn't.
 */
export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.7;

export async function compressForUpload(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri)
    // Only the width is given: the height follows from the aspect ratio, and
    // constraining both would distort anything not in the expected orientation.
    .resize({ width: MAX_EDGE_PX })
    .renderAsync();

  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
  });
  return saved.uri;
}

const UPLOAD_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * PUT the file to the signed URL, retrying a few times.
 *
 * The retry is the point of this function. A worker is standing beside a pool,
 * often at the edge of coverage, and a single dropped connection should not
 * lose the photo they just took. Backoff is short because they are waiting.
 *
 * Only the transfer is retried: the signed URL is good for two hours, so
 * reusing it is correct and re-requesting one would just be a second round
 * trip that can fail too.
 */
async function putWithRetry(
  uploadUrl: string,
  localUri: string,
  contentType: string
): Promise<void> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      const result = await new File(localUri).upload(uploadUrl, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: { "content-type": contentType },
      });

      if (result.status >= 200 && result.status < 300) return;
      lastStatus = result.status;

      // 4xx means the request itself is wrong — a spent token, a rejected
      // mime type. Retrying sends the identical request and fails identically.
      if (result.status >= 400 && result.status < 500) break;
    } catch {
      // Network-level failure: worth another go.
    }

    if (attempt < UPLOAD_ATTEMPTS) await wait(attempt * 750);
  }

  throw new ApiError(
    "OFFLINE",
    lastStatus >= 400 && lastStatus < 500
      ? "That photo was rejected. Take it again."
      : "Couldn't upload the photo. Check your signal and try again.",
    lastStatus
  );
}

/**
 * The whole journey for one photo: compress, get a URL, upload, record.
 *
 * Confirm is last on purpose. A row written before the bytes land would show a
 * broken thumbnail to whoever reviewed the job; an object with no row is
 * invisible and gets collected by the retention job.
 */
export async function uploadTaskPhoto(
  taskId: string,
  type: PhotoTypeValue,
  localUri: string
): Promise<TaskPhoto> {
  const contentType = "image/jpeg";
  const compressed = await compressForUpload(localUri);

  const signed = await photos.requestUpload(taskId, type, contentType);
  await putWithRetry(signed.uploadUrl, compressed, contentType);
  const created = await photos.confirm(taskId, type, signed.path);

  return {
    id: created.id,
    type,
    uploadedAt: new Date().toISOString(),
    // The list call signs display URLs; this one has none until then.
    url: null,
  };
}
