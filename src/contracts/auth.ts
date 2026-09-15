import { z } from "zod";
import { roleSchema } from "./enums";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.input<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Missing refresh token"),
});
export type RefreshInput = z.input<typeof refreshSchema>;

/** Logout is best-effort: a client with no token still wants the call to work. */
export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});
export type LogoutInput = z.input<typeof logoutSchema>;

/** The signed-in user, as every authenticated response describes them. */
export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: roleSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = authTokensSchema.extend({
  user: sessionUserSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;
