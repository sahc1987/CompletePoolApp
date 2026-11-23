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

/** What "Suggest a route" proposes; nothing is saved until it is applied. */
export type RouteSuggestion = {
  /** Task ids in the proposed visit order. */
  taskIds: string[];
  /** False when the current order is already the suggested one. */
  changed: boolean;
  /** Straight-line km saved against the current order (rounded, never negative). */
  savedKm: number;
};
