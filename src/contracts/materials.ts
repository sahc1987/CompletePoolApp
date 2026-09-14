import { z } from "zod";
import {
  choice,
  nonNegativeNumber,
  numeric,
  optionalText,
} from "./primitives";
import { materialRequestStatusSchema } from "./enums";

export const materialFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  unit: z.string().trim().min(1, "Unit is required (e.g. gallon, unit)"),
  costPrice: nonNegativeNumber("Cost can't be negative"),
  customerPrice: nonNegativeNumber("Customer price can't be negative"),
  reorderThreshold: nonNegativeNumber("Reorder threshold can't be negative"),
});

export const saveMaterialSchema = materialFieldsSchema.extend({
  /** Absent when creating. quantityOnHand is never set here — see the service. */
  id: optionalText,
});
export type SaveMaterialInput = z.input<typeof saveMaterialSchema>;

export const toggleMaterialSchema = z.object({
  id: z.string().min(1, "Missing material"),
});
export type ToggleMaterialInput = z.input<typeof toggleMaterialSchema>;

/** RESTOCK is always additive; ADJUSTMENT can be + or - (recount, damage). */
export const stockAdjustmentTypeSchema = z.enum(["RESTOCK", "ADJUSTMENT"]);

export const adjustStockSchema = z.object({
  materialId: z.string().min(1, "Missing material"),
  type: choice(stockAdjustmentTypeSchema, "Pick a stock movement type"),
  quantity: numeric("Quantity must be a number"),
  note: optionalText,
});
export type AdjustStockInput = z.input<typeof adjustStockSchema>;

/** A pending request can only be moved to APPROVED or DENIED. */
export const materialRequestDecisionSchema =
  materialRequestStatusSchema.extract(["APPROVED", "DENIED"]);

export const respondMaterialRequestSchema = z.object({
  requestId: z.string().min(1, "Missing request"),
  decision: choice(materialRequestDecisionSchema, "Pick approve or deny"),
  note: optionalText,
});
export type RespondMaterialRequestInput = z.input<
  typeof respondMaterialRequestSchema
>;
