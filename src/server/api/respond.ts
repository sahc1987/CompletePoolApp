import type { z, ZodTypeAny } from "zod";
import { NextResponse } from "next/server";
import type { ServiceError, ServiceErrorCode, ServiceResult } from "@/server/result";

/**
 * The single shape every /api/v1 response takes.
 *
 * One envelope means the mobile client writes one error path instead of one per
 * endpoint, and `code` is what it branches on — never the message, which is
 * written for a person to read and will be reworded.
 */

export type ApiErrorCode =
  | ServiceErrorCode
  /** No credential, or one that doesn't verify. 401. */
  | "UNAUTHENTICATED"
  /** Too many requests. 429. */
  | "RATE_LIMITED"
  /** Something broke on our side. 500. */
  | "INTERNAL";

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  // 422 rather than 409: the request is well-formed and the row exists, but
  // the operation doesn't apply in its current state (approving a cancelled
  // job). A client can show the message; retrying unchanged won't help.
  STATE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string };
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  init?: { headers?: HeadersInit }
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code], headers: init?.headers }
  );
}

/** A service's failure, forwarded with its code mapped to a status. */
export function serviceError(err: ServiceError): NextResponse<ApiErrorBody> {
  return apiError(err.code, err.error);
}

export function apiOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/** 204, for a mutation with nothing worth sending back. */
export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Turn a `ServiceResult` into a response. This is the whole of a typical route
 * handler's tail: the service already decided what happened and why.
 */
export function respond<T>(
  result: ServiceResult<T>,
  status = 200
): NextResponse {
  return result.ok ? apiOk(result.data, status) : serviceError(result);
}

/**
 * Read and parse a JSON body.
 *
 * Returns an envelope rather than throwing, and treats an absent body as `{}`
 * so an endpoint whose fields are all optional works with no body at all.
 */
export async function readJson(
  req: Request
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const raw = await req.text();
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: apiError("VALIDATION", "Request body isn't valid JSON."),
    };
  }
}

/**
 * Read the body and validate it against a contract schema in one step.
 *
 * The service validates again — it has to, since the web adapter reaches it by
 * another road — but doing it here too means a malformed request is rejected
 * with the field's own message before any work starts, and the route hands the
 * service a typed value instead of an `unknown` it must cast.
 */
export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S
): Promise<
  { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }
> {
  const body = await readJson(req);
  if (!body.ok) return body;

  const parsed = schema.safeParse(body.body);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError("VALIDATION", parsed.error.errors[0].message),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Wrap a handler so an unexpected throw becomes a 500 in the same envelope
 * rather than Next's HTML error page — which a native client cannot parse and
 * which can leak a stack trace.
 */
export function handle(
  fn: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>
) {
  return async (
    req: Request,
    ctx: { params: Record<string, string> }
  ): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      // Logged for us; the caller is told nothing about what broke.
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}`, e);
      return apiError("INTERNAL", "Something went wrong. Try again.");
    }
  };
}
