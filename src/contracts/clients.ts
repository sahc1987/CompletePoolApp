import { z } from "zod";
import { optionalEmail, optionalText } from "./primitives";

export const clientFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  notes: optionalText,
});
export type ClientFieldsInput = z.input<typeof clientFieldsSchema>;

export const updateClientSchema = clientFieldsSchema.extend({
  id: z.string().min(1, "Missing client id"),
});
export type UpdateClientInput = z.input<typeof updateClientSchema>;

export const deleteClientSchema = z.object({
  id: z.string().min(1, "Missing client id"),
});
export type DeleteClientInput = z.input<typeof deleteClientSchema>;

export const poolFieldsSchema = z.object({
  address: z.string().trim().min(1, "Address is required"),
  size: optionalText,
  type: optionalText,
});
export type PoolFieldsInput = z.input<typeof poolFieldsSchema>;

export const createPoolSchema = poolFieldsSchema.extend({
  clientId: z.string().min(1, "Missing client id"),
});
export type CreatePoolInput = z.input<typeof createPoolSchema>;

export const updatePoolSchema = poolFieldsSchema.extend({
  id: z.string().min(1, "Missing pool id"),
});
export type UpdatePoolInput = z.input<typeof updatePoolSchema>;

export const deletePoolSchema = z.object({
  id: z.string().min(1, "Missing pool id"),
});
export type DeletePoolInput = z.input<typeof deletePoolSchema>;
