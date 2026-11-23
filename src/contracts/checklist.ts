import { z } from "zod";

/**
 * Per-service checklists. An admin writes each service's list in Settings; the
 * worker ticks items off on the job. It is a reminder, never a gate: unticked
 * items are shown to the reviewer, and the worker can still submit.
 *
 * Shared with the mobile app (`@contracts/checklist`).
 */

export const MAX_CHECKLIST_ITEMS = 30;
export const MAX_CHECKLIST_LABEL = 80;

/** One line as the worker sees it. `done` is false until ticked. */
export type ChecklistEntry = { id: string; label: string; done: boolean };

/** A worker's ticks for a job: the ids of the items that are done. Replaces what was saved before. */
export const saveTaskChecklistSchema = z.object({
  taskId: z.string().min(1, "Task is required"),
  done: z.array(z.string()).max(MAX_CHECKLIST_ITEMS, "Too many items"),
});
export type SaveTaskChecklistInput = z.input<typeof saveTaskChecklistSchema>;

/** An admin's whole list for a service, one string per line, in order. */
export const serviceChecklistSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  items: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MAX_CHECKLIST_LABEL, `Keep each item under ${MAX_CHECKLIST_LABEL} characters.`)
    )
    .max(MAX_CHECKLIST_ITEMS, `A checklist can have at most ${MAX_CHECKLIST_ITEMS} items.`),
});
export type ServiceChecklistInput = z.input<typeof serviceChecklistSchema>;

/** How many items are still unticked, for a reminder or a review line. */
export const untickedCount = (items: ChecklistEntry[]) => items.filter((i) => !i.done).length;
