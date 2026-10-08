import { z } from "zod";
import {
  choice,
  dateOnly,
  nonNegativeNumber,
  optionalEmail,
  optionalText,
  positiveInt,
  positiveNumber,
  timeOnly,
} from "./primitives";

/**
 * Two shapes behind one form: quote an existing client, or capture a brand new
 * one on the spot. Workers meet prospects in the field before they're in the
 * system, so requiring an admin to add the client first would stall the quote.
 */
export const estimateModeSchema = z.enum(["existing", "new"]);

export const createEstimateSchema = z
  .object({
    mode: choice(estimateModeSchema, "Pick a client source").default("existing"),
    clientId: optionalText,
    poolId: optionalText,
    newName: optionalText,
    newPhone: optionalText,
    newEmail: optionalEmail,
    newAddress: optionalText,
    notes: optionalText,
    validUntil: optionalText,
  })
  .refine((d) => d.mode === "new" || !!d.clientId, {
    message: "Pick a client",
  })
  .refine((d) => d.mode === "existing" || !!d.newName, {
    message: "Enter the new customer's name",
  });
export type CreateEstimateInput = z.input<typeof createEstimateSchema>;

export const addLineItemSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  description: z.string().trim().min(1, "Describe the line item"),
  quantity: positiveNumber("Quantity must be positive"),
  unitPrice: nonNegativeNumber("Price can't be negative"),
});
export type AddLineItemInput = z.input<typeof addLineItemSchema>;

export const deleteLineItemSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  id: z.string().min(1, "Missing line item"),
});
export type DeleteLineItemInput = z.input<typeof deleteLineItemSchema>;

export const addTaxSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  taxRateId: z.string().min(1, "Pick a tax rate"),
});
export type AddTaxInput = z.input<typeof addTaxSchema>;

export const removeTaxSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  id: z.string().min(1, "Missing tax row"),
});
export type RemoveTaxInput = z.input<typeof removeTaxSchema>;

export const estimateIdSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
});
export type EstimateIdInput = z.input<typeof estimateIdSchema>;

export const signEstimateSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  signedByName: z.string().trim().min(1, "Enter the client's name"),
  /** Base64 PNG from a signature pad — the same contract on web and mobile. */
  signatureData: z.string().min(1, "Capture a signature first"),
});
export type SignEstimateInput = z.input<typeof signEstimateSchema>;

/**
 * Turn a signed estimate into a scheduled job. The price defaults to the
 * signed total in the form, but the admin can change it (e.g. a one-off repair
 * quoted as several visits).
 */
export const scheduleEstimateSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  poolId: z.string().min(1, "Pick a pool"),
  workerId: z.string().min(1, "Pick a worker"),
  serviceId: z.string().min(1, "Pick a service"),
  date: dateOnly("Pick a date"),
  time: timeOnly("Pick a start time"),
  durationMin: positiveInt("Duration must be positive"),
  price: nonNegativeNumber("Price can't be negative"),
  notes: optionalText,
});
export type ScheduleEstimateInput = z.input<typeof scheduleEstimateSchema>;

export const declineEstimateSchema = z.object({
  estimateId: z.string().min(1, "Missing estimate"),
  declineReason: optionalText,
});
export type DeclineEstimateInput = z.input<typeof declineEstimateSchema>;
