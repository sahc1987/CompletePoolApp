import { z } from "zod";
import { optionalText } from "./primitives";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: optionalText,
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
