import { z } from "zod";

/**
 * The domain enums, restated as Zod enums.
 *
 * These deliberately duplicate the Prisma enums rather than wrapping them with
 * `z.nativeEnum`. Everything in `contracts/` is imported by the React Native
 * app as well as the server, and importing `@prisma/client` for its enums would
 * drag the whole client into a mobile bundle that has no database.
 *
 * Prisma compiles its enums to plain string unions, so these stay assignable in
 * both directions. The compile-time checks in `server/enumParity.ts` fail the build if
 * the two ever drift.
 */

export const roleSchema = z.enum(["OWNER", "ADMIN", "WORKER"]);
export type RoleValue = z.infer<typeof roleSchema>;

export const taskStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "SUBMITTED",
  "APPROVED",
  "FLAGGED",
  "CANCELLED",
]);
export type TaskStatusValue = z.infer<typeof taskStatusSchema>;

export const frequencySchema = z.enum([
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
]);
export type FrequencyValue = z.infer<typeof frequencySchema>;

export const photoTypeSchema = z.enum(["BEFORE", "AFTER"]);
export type PhotoTypeValue = z.infer<typeof photoTypeSchema>;

export const stockMovementTypeSchema = z.enum([
  "USAGE",
  "RESTOCK",
  "ADJUSTMENT",
  "REVERSAL",
]);
export type StockMovementTypeValue = z.infer<typeof stockMovementTypeSchema>;

export const materialRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "DENIED",
]);
export type MaterialRequestStatusValue = z.infer<
  typeof materialRequestStatusSchema
>;

export const paymentStatusSchema = z.enum(["PENDING", "PARTIAL", "PAID"]);
export type PaymentStatusValue = z.infer<typeof paymentStatusSchema>;

export const paymentMethodSchema = z.enum(["CASH", "CHECK", "ONLINE"]);
export type PaymentMethodValue = z.infer<typeof paymentMethodSchema>;

export const estimateStatusSchema = z.enum([
  "DRAFT",
  "PRESENTED",
  "APPROVED",
  "DECLINED",
]);
export type EstimateStatusValue = z.infer<typeof estimateStatusSchema>;
