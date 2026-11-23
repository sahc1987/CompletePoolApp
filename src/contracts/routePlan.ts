import { z } from "zod";
import { dateOnly } from "./primitives";

/** One worker's day, as a new visit order (task ids, first stop first). */
export const routeOrderSchema = z.object({
  day: dateOnly("Pick a day"),
  workerId: z.string().min(1, "Pick a worker"),
  taskIds: z.array(z.string().min(1)).min(2, "Nothing to reorder").max(60),
});
export type RouteOrderInput = z.input<typeof routeOrderSchema>;

export const routeSuggestSchema = routeOrderSchema.pick({ day: true, workerId: true });
export type RouteSuggestInput = z.input<typeof routeSuggestSchema>;

/** The job as typed so far in the assign form; enough to judge each worker. */
export const rankWorkersSchema = z.object({
  clientId: z.string().min(1, "Pick a client"),
  poolId: z.string().min(1, "Pick a pool"),
  date: dateOnly("Pick a date"),
  time: z.string().min(1, "Pick a start time"),
  durationMin: z.coerce.number().int().positive("Duration must be positive"),
  repeat: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).default("NONE"),
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  repeatEndDate: z.string().optional(),
});
export type RankWorkersInput = z.input<typeof rankWorkersSchema>;

export type WorkerFit = {
  workerId: string;
  name: string;
  /** Visits (the first included) that overlap another job of theirs. */
  clashes: number;
  /** Plain-words reason for the first clash, when there is one. */
  clashNote: string | null;
  /** Extra driving the first visit adds to their day, km; null if unplaced. */
  extraKm: number | null;
  /** Jobs they already have on the first visit's day. */
  jobsThatDay: number;
  /** Has served this client most often lately. */
  usual: boolean;
  /** Lower is better; only meaningful when clashes is 0. */
  score: number;
};

/** What "Suggest a route" proposes; nothing is saved until it is applied. */
export type RouteSuggestion = {
  /** Task ids in the proposed visit order. */
  taskIds: string[];
  /** False when the current order is already the suggested one. */
  changed: boolean;
  /** Straight-line km saved against the current order (rounded, never negative). */
  savedKm: number;
};
