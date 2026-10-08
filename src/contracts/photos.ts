import { z } from "zod";
import { photoTypeSchema } from "./enums";
import { choice } from "./primitives";

/**
 * Upload is two calls with a direct PUT between them:
 *
 *   1. requestUpload  — the server authorizes and hands back a signed URL
 *   2. the device PUTs the image bytes straight to storage
 *   3. confirmUpload  — the server records the row
 *
 * The bytes never pass through the API. A serverless function caps a request
 * body at 4.5MB and a modern phone photo clears that routinely, so routing the
 * image through it would fail on exactly the photos that matter.
 */

export const photoContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const requestPhotoUploadSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  type: choice(photoTypeSchema, "Pick before or after"),
  contentType: choice(
    photoContentTypeSchema,
    "Photos must be a JPEG, PNG or WebP"
  ),
});
export type RequestPhotoUploadInput = z.input<typeof requestPhotoUploadSchema>;

export const confirmPhotoUploadSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  type: choice(photoTypeSchema, "Pick before or after"),
  /**
   * The object path from the upload request, echoed back.
   *
   * The server checks it belongs to this task rather than trusting it — a
   * caller that could name any path could attach someone else's photo to their
   * own job, or point a row at an object they don't own.
   */
  path: z.string().min(1, "Missing upload path"),
});
export type ConfirmPhotoUploadInput = z.input<typeof confirmPhotoUploadSchema>;

export const deletePhotoSchema = z.object({
  photoId: z.string().min(1, "Missing photo"),
});
export type DeletePhotoInput = z.input<typeof deletePhotoSchema>;
