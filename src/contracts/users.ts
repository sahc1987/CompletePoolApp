import { z } from "zod";
import { choice, optionalText } from "./primitives";
import { roleSchema } from "./enums";

/**
 * Optional "YYYY-MM-DD" that also accepts a blank field.
 *
 * Kept as a string here and converted in the service: the parse has to build a
 * local-midnight Date, and a bare ISO string is UTC — which lands on the
 * previous day west of Greenwich.
 */
const optionalDateString = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: `${label} must be a valid date`,
    })
    .optional()
    .transform((v) => (v ? v : undefined));

export const saveEmploymentSchema = z.object({
  userId: z.string().min(1, "Missing user"),
  /**
   * Blank clears the rate. Kept as a string so "" stays distinguishable from
   * "0" — one means "not paid hourly", the other is a real rate.
   */
  hourlyRate: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Number(v)), {
      message: "Hourly pay must be a number",
    })
    .refine((v) => v === "" || Number(v) >= 0, {
      message: "Hourly pay can't be negative",
    })
    .optional()
    .transform((v) => v ?? ""),
  hiredOn: optionalDateString("Hire date"),
  birthday: optionalDateString("Birthday"),
  note: z.string().trim().max(200).optional(),
});
export type SaveEmploymentInput = z.input<typeof saveEmploymentSchema>;

export const setUserRoleSchema = z.object({
  userId: z.string().min(1, "Missing user"),
  role: choice(roleSchema, "Pick a role"),
});
export type SetUserRoleInput = z.input<typeof setUserRoleSchema>;

export const toggleUserActiveSchema = z.object({
  userId: z.string().min(1, "Missing user"),
});
export type ToggleUserActiveInput = z.input<typeof toggleUserActiveSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That email doesn't look right"),
  phone: optionalText,
  role: choice(roleSchema, "Pick a role"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const resetUserPasswordSchema = z.object({
  userId: z.string().min(1, "Missing user"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetUserPasswordInput = z.input<typeof resetUserPasswordSchema>;
