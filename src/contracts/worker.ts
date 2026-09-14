import { z } from "zod";
import { optionalText, positiveNumber } from "./primitives";

/** One material and how much of it a job consumed. */
export const materialUsageSchema = z.object({
  materialId: z.string().min(1),
  qty: z.number().positive(),
});
export type MaterialUsageInput = z.infer<typeof materialUsageSchema>;

export const startTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
});
export type StartTaskInput = z.input<typeof startTaskSchema>;

export const submitTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  /**
   * Only materials actually used. The web form lists the whole catalog and
   * leaves most boxes blank, so the transport filters before it gets here — a
   * blank box is not a zero.
   */
  usage: z.array(materialUsageSchema).default([]),
});
export type SubmitTaskInput = z.input<typeof submitTaskSchema>;

export const createMaterialRequestSchema = z
  .object({
    materialId: optionalText,
    description: optionalText,
    quantityRequested: positiveNumber("Quantity must be greater than zero"),
    taskId: optionalText,
    // Strict boolean, not coerced: `z.coerce.boolean()` reads the string "off"
    // as true, which is exactly the value an unchecked box can arrive with.
    urgent: z.boolean().default(false),
  })
  .refine((d) => !!d.materialId || !!d.description, {
    message: "Pick a catalog material or describe what you need",
  });
export type CreateMaterialRequestInput = z.input<
  typeof createMaterialRequestSchema
>;
