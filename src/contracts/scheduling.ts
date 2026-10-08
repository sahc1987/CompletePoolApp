import { z } from "zod";
import {
  choice,
  dateOnly,
  nonNegativeNumber,
  optionalText,
  positiveInt,
  timeOnly,
} from "./primitives";
import { frequencySchema } from "./enums";

/** "NONE" is a real choice in the form, not an absent frequency. */
export const repeatSchema = z.enum([
  "NONE",
  ...frequencySchema.options,
] as [string, ...string[]]);

/** 0 = Sunday … 6 = Saturday, matching `Date.getDay()` and the stored column. */
export const dayOfWeekSchema = z.coerce.number().int().min(0).max(6);

export const createTaskSchema = z.object({
  clientId: z.string().min(1, "Pick a client"),
  poolId: z.string().min(1, "Pick a pool"),
  workerId: z.string().min(1, "Pick a worker"),
  serviceId: z.string().min(1, "Pick a service"),
  date: dateOnly("Pick a date"),
  time: timeOnly("Pick a start time"),
  durationMin: positiveInt("Duration must be positive"),
  price: nonNegativeNumber("Price can't be negative"),
  notes: optionalText,
  /** Extra services to attach; each has its current price snapshotted. */
  extras: z.array(z.string().min(1)).default([]),
  repeat: choice(repeatSchema, "Pick how often this repeats").default("NONE"),
  /** Only meaningful for WEEKLY/BIWEEKLY; defaults to the job's own weekday. */
  daysOfWeek: z.array(dayOfWeekSchema).default([]),
  repeatEndDate: optionalText,
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

/**
 * Drag / resize on the calendar. `startISO` is an absolute instant from the
 * browser, so unlike the form it needs no timezone parsing — but the checks and
 * the stored day still use the business clock.
 */
export const rescheduleTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  startISO: z.string().min(1, "Missing date"),
  durationMin: positiveInt("Duration must be positive"),
});
export type RescheduleTaskInput = z.input<typeof rescheduleTaskSchema>;

export const editTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  workerId: z.string().min(1, "Pick a worker"),
  serviceId: z.string().min(1, "Pick a service"),
  date: dateOnly("Pick a date"),
  time: timeOnly("Pick a start time"),
  durationMin: positiveInt("Duration must be positive"),
  price: nonNegativeNumber("Price can't be negative"),
  /**
   * Recurring jobs only: also apply the worker, service, start time, duration
   * and price to every later scheduled job in the series. Each keeps its own
   * date — only this job moves to the date given above.
   */
  applyToSeries: z.boolean().default(false),
});
export type EditTaskInput = z.input<typeof editTaskSchema>;

export const finishTaskSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
  /** Materials the admin is logging on the way out. */
  usage: z
    .array(
      z.object({
        materialId: z.string().min(1),
        qty: z.number().positive(),
      })
    )
    .default([]),
  /**
   * Finishing skips the worker's submit and the review. For a job that was
   * never submitted that has to be a deliberate choice, not a stray click.
   */
  override: z.boolean().default(false),
});
export type FinishTaskInput = z.input<typeof finishTaskSchema>;

export const taskIdSchema = z.object({
  taskId: z.string().min(1, "Missing task"),
});

/** Cancel one job. Material it already used goes back on the shelf. */
export const cancelTaskSchema = taskIdSchema;
export type CancelTaskInput = z.input<typeof cancelTaskSchema>;

/** Make this job the last in its recurring series. */
export const endSeriesSchema = taskIdSchema;
export type EndSeriesInput = z.input<typeof endSeriesSchema>;
