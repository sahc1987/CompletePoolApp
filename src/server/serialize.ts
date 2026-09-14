import { Prisma } from "@prisma/client";
import { toNumber } from "@/lib/serialize";

/**
 * The JSON boundary for everything a service returns.
 *
 * Prisma hands back `Decimal` objects and `Date`s. Neither survives a trip to a
 * client component or an HTTP response intact: a Decimal loses its prototype
 * and arrives as `{ s, e, d }`, and a Date silently becomes an ISO string on
 * one path and stays a Date on the other. Converting once, here, means a
 * service's return type is the same shape the mobile app will parse.
 *
 * Money becomes a `number`. Every total in this app is computed server-side —
 * `lib/billing.ts` sums payments, `services/estimates.ts` recalculates a
 * signed estimate — so the client only ever displays these, and float precision
 * at the display boundary is not a risk. Nothing downstream should do
 * arithmetic on them.
 *
 * Dates become ISO 8601 strings, always UTC instants. Formatting them for a
 * reader is the presentation layer's job, and it must use the business
 * timezone from `AppSettings` rather than the device's — see `lib/timezone.ts`.
 */

/** `Decimal | number | null` -> `number | null`. */
export const money = toNumber;

/** A required money column, where the schema guarantees a value. */
export function requiredMoney(
  value: Prisma.Decimal | number | null | undefined
): number {
  return toNumber(value) ?? 0;
}

/** `Date | null` -> ISO string | null. */
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** A required timestamp column. */
export function requiredIso(value: Date): string {
  return value.toISOString();
}

/**
 * Recursively convert every Decimal and Date in a plain object graph.
 *
 * Useful for a wide row where naming each column would be noise. Prefer an
 * explicit mapper when a service's return shape is part of its contract — this
 * one's output type is only as precise as its input, so it can't tell a caller
 * which fields became numbers.
 */
export function serialize<T>(value: T): Serialized<T> {
  if (value === null || value === undefined) return value as Serialized<T>;
  if (value instanceof Date) return value.toISOString() as Serialized<T>;
  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber() as Serialized<T>;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serialize(v)) as Serialized<T>;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out as Serialized<T>;
  }
  return value as Serialized<T>;
}

/** What `serialize` does to a type: Decimal -> number, Date -> string. */
export type Serialized<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? Array<Serialized<U>>
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
