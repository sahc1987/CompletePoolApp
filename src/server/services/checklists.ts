import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import { badState, invalid, notFound, ok, type ServiceResult } from "@/server/result";
import {
  saveTaskChecklistSchema,
  serviceChecklistSchema,
  type ChecklistEntry,
  type SaveTaskChecklistInput,
  type ServiceChecklistInput,
} from "@/contracts/checklist";

/**
 * Per-service checklists. The admin defines them; a job keeps its own
 * snapshot of ticks (Task.checklist) so later edits don't rewrite history.
 */

type Item = { id: string; label: string };

/**
 * What a job's checklist looks like right now: its saved snapshot, plus any
 * item the service has gained since that was saved (unticked). With no
 * snapshot yet, it is just the service's current items, all unticked.
 */
export function mergeChecklist(snapshot: unknown, items: Item[]): ChecklistEntry[] {
  const saved: ChecklistEntry[] = Array.isArray(snapshot)
    ? snapshot.filter(
        (e): e is ChecklistEntry =>
          !!e && typeof e.id === "string" && typeof e.label === "string" && typeof e.done === "boolean"
      )
    : [];
  const have = new Set(saved.map((e) => e.id));
  return [...saved, ...items.filter((i) => !have.has(i.id)).map((i) => ({ ...i, done: false }))];
}

/** Admin: replace a service's checklist with this list, in order. */
export async function saveServiceChecklist(
  actor: Actor,
  input: ServiceChecklistInput
): Promise<ServiceResult<{ count: number }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = serviceChecklistSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  // Blank lines were dropped by the schema; repeats (ignoring case) are too.
  const seen = new Set<string>();
  const labels = parsed.data.items.filter((l) => {
    const k = l.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });

  const service = await prisma.service.findUnique({
    where: { id: parsed.data.serviceId },
    select: { id: true },
  });
  if (!service) return notFound("Service not found.");

  const existing = await prisma.checklistItem.findMany({ where: { serviceId: service.id } });
  const byLabel = new Map(existing.map((e) => [e.label.toLowerCase(), e]));

  // Keep a row whose wording is unchanged (so a worker's ticks on it still
  // match), drop the rest, add what's new.
  const keepIds = new Set<string>();
  const ops = labels.map((label, position) => {
    const match = byLabel.get(label.toLowerCase());
    if (match) {
      keepIds.add(match.id);
      return prisma.checklistItem.update({ where: { id: match.id }, data: { label, position } });
    }
    return prisma.checklistItem.create({ data: { serviceId: service.id, label, position } });
  });
  const removeIds = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);

  await prisma.$transaction([
    prisma.checklistItem.deleteMany({ where: { id: { in: removeIds } } }),
    ...ops,
  ]);
  return ok({ count: labels.length });
}

/**
 * Worker: save which items are ticked on their own started job. Replaces the
 * previous ticks, so the phone can send the same save again harmlessly.
 */
export async function saveTaskChecklist(
  actor: Actor,
  input: SaveTaskChecklistInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "WORKER");
  if (denied) return denied;

  const parsed = saveTaskChecklistSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.taskId },
    select: {
      id: true,
      workerId: true,
      status: true,
      checklist: true,
      service: {
        select: { checklistItems: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
      },
    },
  });
  // Someone else's job answers 404: a worker has no business learning which ids exist.
  if (!task || task.workerId !== actor.id) return notFound("Task not found.");
  if (task.status !== "IN_PROGRESS") return badState("Start the job before ticking its checklist.");

  const done = new Set(parsed.data.done);
  // Ids that aren't on this job's checklist are ignored.
  const entries = mergeChecklist(task.checklist, task.service.checklistItems).map((e) => ({
    ...e,
    done: done.has(e.id),
  }));
  await prisma.task.update({ where: { id: task.id }, data: { checklist: entries } });
  return ok();
}
