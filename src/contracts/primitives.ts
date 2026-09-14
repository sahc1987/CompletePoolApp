import { z } from "zod";

/**
 * Field builders shared across the contracts.
 *
 * The same schema is parsed from two very different sources: an HTML form,
 * where every value arrives as a string, and a JSON request body, where numbers
 * and booleans arrive with their real types. These helpers accept both so
 * neither transport has to pre-convert — and so the inferred input type says
 * honestly what the field will take.
 */

/** Accepts `"12.5"` or `12.5`. Use instead of a bare `z.coerce.number()`. */
export function numeric(message?: string) {
  return z
    .union([z.string(), z.number()], {
      errorMap: () => ({ message: message ?? "Must be a number" }),
    })
    .pipe(z.coerce.number({ invalid_type_error: message ?? "Must be a number" }));
}

/** A required money/quantity field that must be greater than zero. */
export function positiveNumber(message: string) {
  return numeric(message).pipe(z.number().positive(message));
}

/** A money/quantity field that may be zero but never negative. */
export function nonNegativeNumber(message: string) {
  return numeric(message).pipe(z.number().nonnegative(message));
}

/** A whole number greater than zero, e.g. a duration in minutes. */
export function positiveInt(message: string) {
  return numeric(message).pipe(z.number().int(message).positive(message));
}

/** `"YYYY-MM-DD"`, the shape every date input and API caller sends. */
export const dateOnly = (message: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);

/** `"HH:MM"` on a 24-hour clock. */
export const timeOnly = (message: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, message);

/**
 * Optional free text. Empty strings become `undefined` so a service never has
 * to distinguish "" from "not sent" — a blank form field and an omitted JSON
 * key mean the same thing everywhere in this app.
 */
export const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/** Optional email that also tolerates a blank field. */
export const optionalEmail = z
  .string()
  .trim()
  .email("That email doesn't look right")
  .or(z.literal(""))
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * An enum field as it arrives from a transport: a plain string, validated
 * against the allowed values.
 *
 * Typing these as the bare `z.enum` would force every caller to prove the
 * string is already one of the members — which a `<select>` value and a JSON
 * body never are. Piping through `z.string()` keeps the input type honest and
 * still narrows the output.
 */
export function choice<T extends [string, ...string[]]>(
  schema: z.ZodEnum<T>,
  message: string
) {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .pipe(z.enum(schema.options, { errorMap: () => ({ message }) }));
}
