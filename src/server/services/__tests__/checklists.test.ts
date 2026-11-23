/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import { mergeChecklist, saveServiceChecklist, saveTaskChecklist } from "../checklists";
import { untickedCount } from "@/contracts/checklist";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Olive" };

const items = [
  { id: "i1", label: "Skim the surface" },
  { id: "i2", label: "Empty baskets" },
];

describe("a job's checklist as it stands", () => {
  it("is the service's items, all unticked, before the worker saves anything", () => {
    expect(mergeChecklist(null, items)).toEqual([
      { id: "i1", label: "Skim the surface", done: false },
      { id: "i2", label: "Empty baskets", done: false },
    ]);
  });

  it("keeps the worker's ticks, and adds items the service has gained since", () => {
    const snapshot = [{ id: "i1", label: "Skim the surface", done: true }];
    const merged = mergeChecklist(snapshot, items);
    expect(merged).toEqual([
      { id: "i1", label: "Skim the surface", done: true },
      { id: "i2", label: "Empty baskets", done: false },
    ]);
    expect(untickedCount(merged)).toBe(1);
  });

  it("keeps an item the admin has since removed (the job's own record)", () => {
    const snapshot = [{ id: "gone", label: "Old step", done: true }];
    expect(mergeChecklist(snapshot, [])).toEqual(snapshot);
  });

  it("ignores a malformed snapshot rather than failing", () => {
    expect(mergeChecklist("junk", items)).toHaveLength(2);
    expect(mergeChecklist([{ id: 1 }, null], items)).toHaveLength(2);
  });
});

describe("an admin writing a service's checklist", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.checklistItem.findMany.mockResolvedValue([
      { id: "i1", label: "Skim the surface", position: 0 },
      { id: "i2", label: "Old step", position: 1 },
    ]);
  });

  it.each([["a worker", worker], ["the read-only owner", owner]])("refuses %s", async (_n, actor) => {
    const res = await saveServiceChecklist(actor, { serviceId: "s1", items: ["x"] });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.checklistItem.create).not.toHaveBeenCalled();
  });

  it("keeps a row whose wording is unchanged, drops the rest, adds what's new", async () => {
    const res = await saveServiceChecklist(admin, {
      serviceId: "s1",
      items: ["skim the surface", "Brush the walls", "SKIM THE SURFACE"],
    });
    expect(res).toEqual({ ok: true, data: { count: 2 } });
    // The repeat (ignoring case) was dropped; the kept row is updated, not re-created.
    expect(prismaMock.checklistItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { label: "skim the surface", position: 0 },
    });
    expect(prismaMock.checklistItem.create).toHaveBeenCalledWith({
      data: { serviceId: "s1", label: "Brush the walls", position: 1 },
    });
    expect(prismaMock.checklistItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["i2"] } } });
  });

  it("can clear a checklist", async () => {
    const res = await saveServiceChecklist(admin, { serviceId: "s1", items: [] });
    expect(res).toEqual({ ok: true, data: { count: 0 } });
    expect(prismaMock.checklistItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["i1", "i2"] } } });
  });

  it("rejects too many or too-long items, and an unknown service", async () => {
    const many = Array.from({ length: 31 }, (_, i) => `Item ${i}`);
    expect(await saveServiceChecklist(admin, { serviceId: "s1", items: many })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await saveServiceChecklist(admin, { serviceId: "s1", items: ["x".repeat(81)] })).toMatchObject({ ok: false, code: "VALIDATION" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    expect(await saveServiceChecklist(admin, { serviceId: "nope", items: ["a"] })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("a worker ticking items on their job", () => {
  const seed = (over: Record<string, unknown> = {}) =>
    prismaMock.task.findUnique.mockResolvedValue({
      id: "t1",
      workerId: "w1",
      status: "IN_PROGRESS",
      checklist: null,
      service: { checklistItems: items },
      ...over,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    seed();
  });

  it("saves ticks as a snapshot of labels and done flags", async () => {
    const res = await saveTaskChecklist(worker, { taskId: "t1", done: ["i2"] });
    expect(res.ok).toBe(true);
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        checklist: [
          { id: "i1", label: "Skim the surface", done: false },
          { id: "i2", label: "Empty baskets", done: true },
        ],
      },
    });
  });

  it("is safe to send twice, and an unticked item can be unticked again", async () => {
    await saveTaskChecklist(worker, { taskId: "t1", done: ["i1", "i2"] });
    seed({ checklist: [{ id: "i1", label: "Skim the surface", done: true }, { id: "i2", label: "Empty baskets", done: true }] });
    await saveTaskChecklist(worker, { taskId: "t1", done: ["i1"] });
    const last = prismaMock.task.update.mock.calls[1][0].data.checklist;
    expect(last.map((e: { done: boolean }) => e.done)).toEqual([true, false]);
  });

  it("ignores ids that aren't on the job's checklist", async () => {
    await saveTaskChecklist(worker, { taskId: "t1", done: ["not-an-item"] });
    const saved = prismaMock.task.update.mock.calls[0][0].data.checklist;
    expect(saved.every((e: { done: boolean }) => e.done === false)).toBe(true);
  });

  it.each([["an admin", admin], ["the read-only owner", owner]])("refuses %s", async (_n, actor) => {
    expect(await saveTaskChecklist(actor, { taskId: "t1", done: [] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("answers 404 for someone else's job, and needs the job started", async () => {
    seed({ workerId: "somebody-else" });
    expect(await saveTaskChecklist(worker, { taskId: "t1", done: [] })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    seed({ status: "SCHEDULED" });
    expect(await saveTaskChecklist(worker, { taskId: "t1", done: [] })).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });
});
