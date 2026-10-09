import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { clearSession, readSession, writeSession } from "./storage";

/**
 * The typed HTTP client every screen goes through.
 *
 * Two things it must get right:
 *
 *  1. A 401 means "this access token aged out", which happens to every device
 *     every 15 minutes. The user must never see that — the client refreshes and
 *     replays the request once.
 *  2. Several screens load at once, so several requests hit 401 together. They
 *     must not each fire their own refresh: the endpoint rotates the token, so
 *     the second refresh would present one the first already spent, the server
 *     would read that as a stolen token and revoke the whole family, and the
 *     user would be signed out for opening two tabs. Hence the single-flight
 *     promise below — a concurrent refresh is *joined*, never started twice.
 */

/** Anything the UI can show a person, with the code it should branch on. */
export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STATE"
  | "RATE_LIMITED"
  | "INTERNAL"
  /** Never reached the server: no signal, DNS, TLS, timeout. */
  | "OFFLINE";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  /** Worth offering a retry button for; a validation failure is not. */
  get retryable(): boolean {
    return (
      this.code === "OFFLINE" ||
      this.code === "INTERNAL" ||
      this.code === "RATE_LIMITED"
    );
  }
}

/**
 * Where the API lives.
 *
 * Resolved on first use rather than at import. Throwing while the module
 * evaluates would take the whole bundle down before a single screen mounted —
 * a misconfigured build would show a red stack trace instead of a message
 * anyone could act on, and no unit test could import this file at all.
 */
let cachedBase: string | null = null;

export function apiBase(): string {
  if (cachedBase) return cachedBase;

  const configured =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

  if (!configured) {
    throw new ApiError(
      "INTERNAL",
      "This build has no API address configured. Reinstall from a fresh build."
    );
  }

  cachedBase = `${configured.replace(/\/+$/, "")}/api/v1`;
  return cachedBase;
}

/** Called when the session is beyond saving, so the UI can show sign-in. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};

export function setSessionExpiredHandler(fn: SessionExpiredHandler) {
  onSessionExpired = fn;
}

/**
 * The in-flight refresh, if any. Every caller that needs a fresh token awaits
 * this same promise rather than starting its own.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const session = await readSession();
      if (!session) return null;

      const res = await fetch(`${apiBase()}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!res.ok) {
        // The refresh token is spent, revoked or expired. Nothing to salvage.
        await clearSession();
        onSessionExpired();
        return null;
      }

      const tokens = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      await writeSession(tokens);
      return tokens.accessToken;
    } catch {
      // A network failure during refresh is not proof the session is bad, so
      // the stored tokens are left alone to be retried when signal returns.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the bearer token — only the auth endpoints do this. */
  anonymous?: boolean;
  signal?: AbortSignal;
};

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: ApiErrorCode; message?: string };
    };
    if (body?.error?.code && body.error.message) {
      return new ApiError(body.error.code, body.error.message, res.status);
    }
  } catch {
    // Fall through: a non-JSON body means something upstream of the app —
    // a proxy or an edge error page — not our envelope.
  }
  return new ApiError(
    "INTERNAL",
    "Something went wrong. Try again.",
    res.status
  );
}

/**
 * How long a request may take before the app gives up and says so. Without
 * this a request on a dead connection can hang for a minute or more, leaving a
 * button spinning with no explanation.
 */
const REQUEST_TIMEOUT_MS = 20_000;

async function send(
  path: string,
  opts: RequestOptions,
  accessToken: string | null
): Promise<Response> {
  // A caller's own signal still works; the timeout is added alongside it. The
  // abort surfaces as a thrown error, which request() reports as OFFLINE.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  // Cancelled before the request even went out (the screen was left while the
  // session was still being read): the abort event has already fired, so a
  // listener added now would never hear it.
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort);
  try {
    return await fetch(`${apiBase()}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const session = opts.anonymous ? null : await readSession();

  let res: Response;
  try {
    res = await send(path, opts, session?.accessToken ?? null);
  } catch {
    throw new ApiError(
      "OFFLINE",
      "No connection. Check your signal and try again."
    );
  }

  // One retry, and only for an expired token. Retrying a 401 twice would mean
  // the refresh itself is failing, which signing out already handles.
  if (res.status === 401 && !opts.anonymous) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      try {
        res = await send(path, opts, fresh);
      } catch {
        throw new ApiError(
          "OFFLINE",
          "No connection. Check your signal and try again."
        );
      }
    }
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await parseError(res);

  // A 200 with an empty body is valid for endpoints that return nothing.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Download an authenticated file (an invoice or receipt PDF) into the cache
 * and return its local URI, ready for the share sheet.
 *
 * The native downloader can't tell us *why* it failed, so an expired token
 * looks like any other failure: it gets one retry with a fresh token, the same
 * single-flight refresh `request()` uses. The file is overwritten each time —
 * a balance changes, and a stale copy would print the old one.
 */
export async function downloadFile(path: string, filename: string): Promise<string> {
  const target = new File(Paths.cache, filename);
  const attempt = async (token: string | null) => {
    const file = await File.downloadFileAsync(`${apiBase()}${path}`, target, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      idempotent: true,
    });
    return file.uri;
  };

  const session = await readSession();
  try {
    return await attempt(session?.accessToken ?? null);
  } catch {
    const fresh = await refreshAccessToken();
    if (fresh) {
      try {
        return await attempt(fresh);
      } catch {
        // Fall through to the message below.
      }
    }
    throw new ApiError(
      "OFFLINE",
      "Couldn't download the document. Check your signal and try again."
    );
  }
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
