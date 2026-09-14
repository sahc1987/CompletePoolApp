import { z } from "zod";

export const approveTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
});
export type ApproveTaskInput = z.input<typeof approveTaskSchema>;

export const flagTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason so the worker knows what to fix"),
});
export type FlagTaskInput = z.input<typeof flagTaskSchema>;
