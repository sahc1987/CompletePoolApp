import { z } from "zod";
import {
  nonNegativeNumber,
  optionalEmail,
  optionalText,
  positiveInt,
  timeOnly,
} from "./primitives";

export const serviceFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  basePrice: nonNegativeNumber("Base price can't be negative"),
  defaultDurationMin: positiveInt(
    "Duration must be a positive whole number"
  ),
});

export const saveServiceSchema = serviceFieldsSchema.extend({
  /** Absent when creating. */
  id: optionalText,
});
export type SaveServiceInput = z.input<typeof saveServiceSchema>;

export const deleteServiceSchema = z.object({
  id: z.string().min(1, "Missing service"),
});
export type DeleteServiceInput = z.input<typeof deleteServiceSchema>;

export const saveWorkHoursSchema = z.object({
  workdayStart: timeOnly("Enter both times as HH:MM."),
  workdayEnd: timeOnly("Enter both times as HH:MM."),
  timezone: z.string().trim().min(1, "Pick a valid timezone."),
});
export type SaveWorkHoursInput = z.input<typeof saveWorkHoursSchema>;

export const extraFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  price: nonNegativeNumber("Price can't be negative"),
});

export const saveExtraSchema = extraFieldsSchema.extend({
  id: optionalText,
});
export type SaveExtraInput = z.input<typeof saveExtraSchema>;

export const deleteExtraSchema = z.object({
  id: z.string().min(1, "Missing extra"),
});
export type DeleteExtraInput = z.input<typeof deleteExtraSchema>;

export const taxRateFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  rate: nonNegativeNumber("Rate can't be negative"),
});

export const saveTaxRateSchema = taxRateFieldsSchema.extend({
  id: optionalText,
});
export type SaveTaxRateInput = z.input<typeof saveTaxRateSchema>;

export const toggleTaxRateSchema = z.object({
  id: z.string().min(1, "Missing tax rate"),
});
export type ToggleTaxRateInput = z.input<typeof toggleTaxRateSchema>;

/**
 * The business identity printed on every invoice and receipt. Only the name is
 * required; a blank field is left off the documents rather than printed empty.
 */
export const companyInfoSchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  tagline: optionalText,
  address: optionalText,
  phone: optionalText,
  email: optionalEmail,
  website: optionalText,
  taxId: optionalText,
  /** Blank falls back to "Due upon receipt". */
  paymentTerms: optionalText,
  paymentNote: optionalText,
  documentFooter: optionalText,
});
export type CompanyInfoInput = z.input<typeof companyInfoSchema>;
