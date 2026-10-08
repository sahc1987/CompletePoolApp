import { randomBytes } from "node:crypto";
import { StorageClient } from "@supabase/storage-js";

/**
 * Task photos, in a private Supabase Storage bucket.
 *
 * Nothing here is ever reached by a client. The bucket is private, the service
 * role key stays on the server, and devices get short-lived signed URLs — one
 * to upload with, one to display with. A customer's property is not something
 * to put behind a guessable public URL.
 */

export const PHOTO_BUCKET = "task-photos";

/**
 * How long a display URL stays valid. Long enough to load a gallery and keep
 * scrolling; short enough that a URL copied out of a device log is useless by
 * the time anyone finds it.
 */
export const DOWNLOAD_URL_TTL_S = 60 * 60;

/** Supabase's own limit on a signed upload URL, restated so callers can show it. */
export const UPLOAD_URL_TTL_S = 2 * 60 * 60;

/**
 * A phone photo compressed to ~1600px is a few hundred KB. 10MB is generous
 * headroom for an uncompressed original while still refusing a video someone
 * picked by mistake.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * How long a photo is kept before the retention job purges it.
 *
 * Six months, chosen deliberately: it holds the least customer data of the
 * options considered, at the cost of a complaint about spring work being
 * unprovable by autumn. Overridable so the decision can be revisited without a
 * deploy.
 */
export const PHOTO_RETENTION_DAYS = Number(
  process.env.PHOTO_RETENTION_DAYS ?? 183
);

/**
 * The project's storage endpoint.
 *
 * Derived from DATABASE_URL by default. The Postgres user is
 * `postgres.<project-ref>`, and the storage host is
 * `https://<project-ref>.supabase.co` — so requiring a second environment
 * variable that only restates what the first already encodes is a setup step
 * that exists purely to be forgotten. SUPABASE_URL overrides it for anyone
 * running storage elsewhere.
 */
function storageUrl(): string {
  const explicit = process.env.SUPABASE_URL;
  if (explicit) return `${explicit.replace(/[/]+$/, "")}/storage/v1`;

  const ref = /postgres\.([a-z0-9]+)/i.exec(process.env.DATABASE_URL ?? "")?.[1];
  if (!ref) {
    throw new Error(
      "Can't work out the Supabase project from DATABASE_URL. Set SUPABASE_URL explicitly."
    );
  }
  return `https://${ref}.supabase.co/storage/v1`;
}

/** True when photo upload is configured. Screens hide the feature when it isn't. */
export function photoStorageConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let cached: StorageClient | null = null;

function client(): StorageClient {
  if (cached) return cached;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Deliberately loud. A silent fallback would mean photos appearing to
    // upload and quietly going nowhere, which is worse than an error.
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — photo upload is unavailable."
    );
  }

  cached = new StorageClient(storageUrl(), {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
  return cached;
}

/**
 * Where a photo lives in the bucket.
 *
 * Grouped by task so everything for one job can be listed or removed together,
 * and suffixed with randomness so two photos taken in the same second can't
 * collide and so a path can't be guessed from the task id alone.
 */
export function photoObjectPath(
  taskId: string,
  type: "BEFORE" | "AFTER",
  extension: string
): string {
  return `${taskId}/${type.toLowerCase()}-${randomBytes(8).toString("hex")}.${extension}`;
}

export function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export type SignedUpload = {
  /** PUT the image bytes here, with a matching content-type header. */
  uploadUrl: string;
  /** The object path to hand back when confirming the upload. */
  path: string;
  expiresInSeconds: number;
};

export async function createSignedUpload(
  path: string
): Promise<SignedUpload> {
  const { data, error } = await client()
    .from(PHOTO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`Couldn't create an upload URL: ${error?.message ?? "unknown"}`);
  }

  // `signedUrl` already carries the token as a query parameter, so a client can
  // PUT straight to it with no Supabase SDK of its own.
  return {
    uploadUrl: data.signedUrl,
    path: data.path,
    expiresInSeconds: UPLOAD_URL_TTL_S,
  };
}

/** A short-lived URL for displaying one photo. */
export async function createSignedDownload(
  path: string,
  ttlSeconds = DOWNLOAD_URL_TTL_S
): Promise<string | null> {
  const { data, error } = await client()
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, ttlSeconds);

  // A missing object is not worth failing a whole gallery over — the row
  // outlived its file, and the caller renders a placeholder.
  if (error || !data) return null;
  return data.signedUrl;
}

/** Signed URLs for a whole gallery, in one round trip. */
export async function createSignedDownloads(
  paths: string[],
  ttlSeconds = DOWNLOAD_URL_TTL_S
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data, error } = await client()
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, ttlSeconds);

  if (error || !data) return new Map();

  const urls = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/** Delete objects. Used when a photo is removed and by the retention job. */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await client().from(PHOTO_BUCKET).remove(paths);
}

/**
 * Create the bucket if it isn't there. Idempotent, and safe to call from a
 * setup script — it never makes an existing bucket public.
 */
export async function ensurePhotoBucket(): Promise<
  { created: boolean } | { error: string }
> {
  const storage = client();
  const existing = await storage.getBucket(PHOTO_BUCKET);
  if (existing.data) return { created: false };

  const { error } = await storage.createBucket(PHOTO_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: ALLOWED_PHOTO_TYPES,
  });
  if (error) return { error: error.message };
  return { created: true };
}
