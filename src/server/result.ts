/**
 * The return shape every service function uses.
 *
 * Services are called by two transports with different ideas of failure: a
 * server action renders `error` next to a form field, while a REST handler has
 * to pick an HTTP status. Returning a discriminated result rather than throwing
 * lets both decide for themselves, and `code` is what the API layer maps to a
 * status without re-deriving intent from the message text.
 *
 * Messages are user-facing — they are shown verbatim in the web UI and returned
 * verbatim over the API — so they say what to do, not what went wrong
 * internally.
 */

export type ServiceErrorCode =
  /** Input failed validation. 400. */
  | "VALIDATION"
  /** The row doesn't exist, or the actor may not know that it does. 404. */
  | "NOT_FOUND"
  /** Authenticated, but not allowed. 403. */
  | "FORBIDDEN"
  /** Would collide with existing data (double-booking, duplicate email). 409. */
  | "CONFLICT"
  /** Real row, wrong state for this operation (approve a cancelled job). 422. */
  | "STATE";

/**
 * The failure half, named on its own so a guard can return it from a function
 * of any success type — a `ServiceError` is a valid `ServiceResult<T>` for
 * every T, which is what lets `assertRole` sit at the top of every service.
 */
export type ServiceError = {
  ok: false;
  error: string;
  code: ServiceErrorCode;
};

export type ServiceResult<T = void> = { ok: true; data: T } | ServiceError;

export function ok(): ServiceResult<void>;
export function ok<T>(data: T): ServiceResult<T>;
export function ok<T>(data?: T): ServiceResult<T | void> {
  return { ok: true, data: data as T };
}

export function err(code: ServiceErrorCode, error: string): ServiceError {
  return { ok: false, error, code };
}

/** Shorthands for the codes that come up constantly. */
export const invalid = (message: string) => err("VALIDATION", message);
export const notFound = (message = "Not found.") => err("NOT_FOUND", message);
export const forbidden = (message = "You can't do that.") =>
  err("FORBIDDEN", message);
export const conflict = (message: string) => err("CONFLICT", message);
export const badState = (message: string) => err("STATE", message);

/**
 * Narrowing helper so a caller can write `if (isErr(res)) return res;` and keep
 * the error's code intact instead of flattening it to a string on the way up.
 */
export function isErr<T>(res: ServiceResult<T>): res is ServiceError {
  return !res.ok;
}
