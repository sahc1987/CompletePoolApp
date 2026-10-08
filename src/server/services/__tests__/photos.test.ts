/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

// The storage layer is a network boundary; these tests are about the rules in
// front of it. `photoStorageConfigured` is mocked true so the guards are
// reached rather than short-circuited.
jest.mock("@/server/storage/photoStorage", () => ({
  ...jest.requireActual("@/server/storage/photoStorage"),
  photoStorageConfigured: jest.fn(() => true),
  createSignedUpload: jest.fn(async (path: string) => ({
    uploadUrl: `https://storage.example/upload/${path}?token=t`,
    path,
    expiresInSeconds: 7200,
  })),
  createSignedDownloads: jest.fn(async (paths: string[]) =>
    new Map(paths.map((p) => [p, `https://storage.example/signed/${p}`]))
  ),
  removeObjects: jest.fn(async () => {}),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const storage = jest.requireMock("@/server/storage/photoStorage");

import {
  confirmPhotoUpload,
  deletePhoto,
  listTaskPhotos,
  purgeExpiredPhotos,
  requestPhotoUpload,
} from "../photos";

const worker: Actor = { id: "w1", role: "WORKER", name: "Wendy" };
const otherWorker: Actor = { id: "w2", role: "WORKER", name: "Walt" };
const admin: Actor = { id: "a1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "o1", role: "OWNER", name: "Ola" };

const seedTask = (over: Record<string, unknown> = {}) =>
  prismaMock.task.findUnique.mockResolvedValue({
    id: "t1",
    workerId: "w1",
    status: "IN_PROGRESS",
    ...over,
  });

beforeEach(() => {
  seedTask();
  storage.photoStorageConfigured.mockReturnValue(true);
  prismaMock.photo.create.mockResolvedValue({ id: "p1" });
  prismaMock.photo.findMany.mockResolvedValue([]);
});

describe("requesting an upload", () => {
  it("gives a worker a signed URL for their own job", async () => {
    const res = await requestPhotoUpload(worker, {
      taskId: "t1",
      type: "BEFORE",
      contentType: "image/jpeg",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.uploadUrl).toContain("token=");
    // The path is minted by the server, under the task's own folder.
    expect(res.data.path).toMatch(/^t1\/before-[0-9a-f]{16}\.jpg$/);
  });

  it("refuses another worker's job as not found", async () => {
    const res = await requestPhotoUpload(otherWorker, {
      taskId: "t1",
      type: "BEFORE",
      contentType: "image/jpeg",
    });
    // Not FORBIDDEN: a worker shouldn't learn which task ids exist.
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("refuses an owner outright", async () => {
    const res = await requestPhotoUpload(owner, {
      taskId: "t1",
      type: "BEFORE",
      contentType: "image/jpeg",
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("lets an admin photograph any job", async () => {
    seedTask({ workerId: "somebody-else" });
    const res = await requestPhotoUpload(admin, {
      taskId: "t1",
      type: "AFTER",
      contentType: "image/jpeg",
    });
    expect(res.ok).toBe(true);
  });

  /** An approved job's photos are part of what was billed. */
  it("refuses a job that is already approved", async () => {
    seedTask({ status: "APPROVED" });
    const res = await requestPhotoUpload(worker, {
      taskId: "t1",
      type: "AFTER",
      contentType: "image/jpeg",
    });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });

  it("allows a flagged job, which is being reworked", async () => {
    seedTask({ status: "FLAGGED" });
    const res = await requestPhotoUpload(worker, {
      taskId: "t1",
      type: "AFTER",
      contentType: "image/jpeg",
    });
    expect(res.ok).toBe(true);
  });

  it("refuses a content type that isn't an image", async () => {
    const res = await requestPhotoUpload(worker, {
      taskId: "t1",
      type: "BEFORE",
      contentType: "video/mp4",
    });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("reports storage being unconfigured rather than failing obscurely", async () => {
    storage.photoStorageConfigured.mockReturnValue(false);
    const res = await requestPhotoUpload(worker, {
      taskId: "t1",
      type: "BEFORE",
      contentType: "image/jpeg",
    });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
  });
});

/**
 * The confirm step takes a path from the caller, which makes it the one place
 * a client could try to attach an object it doesn't own — another job's photo,
 * or another customer's property.
 */
describe("confirming an upload", () => {
  it("records a photo under the task's own folder", async () => {
    const res = await confirmPhotoUpload(worker, {
      taskId: "t1",
      type: "AFTER",
      path: "t1/after-abc123.jpg",
    });
    expect(res.ok).toBe(true);
    expect(prismaMock.photo.create).toHaveBeenCalledWith({
      data: { taskId: "t1", type: "AFTER", url: "t1/after-abc123.jpg" },
    });
  });

  it("refuses a path belonging to another job", async () => {
    const res = await confirmPhotoUpload(worker, {
      taskId: "t1",
      type: "AFTER",
      path: "t2/after-abc123.jpg",
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.photo.create).not.toHaveBeenCalled();
  });

  it("refuses a path that tries to climb out of the folder", async () => {
    for (const path of [
      "../t2/after.jpg",
      "/t1/after.jpg",
      "t11/after.jpg",
      "",
    ]) {
      prismaMock.photo.create.mockClear();
      const res = await confirmPhotoUpload(worker, {
        taskId: "t1",
        type: "AFTER",
        path,
      });
      expect(res.ok).toBe(false);
      expect(prismaMock.photo.create).not.toHaveBeenCalled();
    }
  });
});

describe("listing photos", () => {
  it("signs a URL per photo", async () => {
    prismaMock.photo.findMany.mockResolvedValue([
      { id: "p1", type: "BEFORE", url: "t1/before-a.jpg", uploadedAt: new Date() },
      { id: "p2", type: "AFTER", url: "t1/after-b.jpg", uploadedAt: new Date() },
    ]);
    const res = await listTaskPhotos(worker, "t1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(2);
    expect(res.data[0].url).toContain("https://storage.example/signed/");
  });

  it("returns the rows with no URL when storage is unconfigured", async () => {
    storage.photoStorageConfigured.mockReturnValue(false);
    prismaMock.photo.findMany.mockResolvedValue([
      { id: "p1", type: "BEFORE", url: "t1/before-a.jpg", uploadedAt: new Date() },
    ]);
    const res = await listTaskPhotos(worker, "t1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0].url).toBeNull();
  });

  it("lets an owner look even though they can't upload", async () => {
    seedTask({ workerId: "somebody-else" });
    const res = await listTaskPhotos(owner, "t1");
    expect(res.ok).toBe(true);
  });

  it("hides another worker's job", async () => {
    const res = await listTaskPhotos(otherWorker, "t1");
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("deleting a photo", () => {
  beforeEach(() => {
    prismaMock.photo.findUnique.mockResolvedValue({
      id: "p1",
      url: "t1/before-a.jpg",
      taskId: "t1",
    });
  });

  it("removes the row and the object", async () => {
    const res = await deletePhoto(worker, { photoId: "p1" });
    expect(res.ok).toBe(true);
    expect(prismaMock.photo.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(storage.removeObjects).toHaveBeenCalledWith(["t1/before-a.jpg"]);
  });

  it("refuses once the job is approved", async () => {
    seedTask({ status: "APPROVED" });
    const res = await deletePhoto(worker, { photoId: "p1" });
    expect(res).toMatchObject({ ok: false, code: "STATE" });
    expect(prismaMock.photo.delete).not.toHaveBeenCalled();
  });

  it("refuses a photo on someone else's job", async () => {
    const res = await deletePhoto(otherWorker, { photoId: "p1" });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prismaMock.photo.delete).not.toHaveBeenCalled();
  });
});

describe("retention", () => {
  it("deletes objects before rows, so a failed run leaves nothing orphaned", async () => {
    prismaMock.photo.findMany.mockResolvedValue([
      { id: "p1", url: "t1/before-a.jpg" },
      { id: "p2", url: "t1/after-b.jpg" },
    ]);
    prismaMock.photo.deleteMany.mockResolvedValue({ count: 2 });

    const res = await purgeExpiredPhotos();
    expect(res).toMatchObject({ ok: true, data: { deleted: 2 } });

    const removeOrder = storage.removeObjects.mock.invocationCallOrder[0];
    const deleteOrder = prismaMock.photo.deleteMany.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(deleteOrder);
  });

  it("only considers photos past the cutoff", async () => {
    prismaMock.photo.findMany.mockResolvedValue([]);
    await purgeExpiredPhotos();

    const where = prismaMock.photo.findMany.mock.calls[0][0].where;
    const cutoff: Date = where.uploadedAt.lt;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(daysAgo)).toBe(183);
  });

  it("does nothing when there is nothing expired", async () => {
    prismaMock.photo.findMany.mockResolvedValue([]);
    const res = await purgeExpiredPhotos();
    expect(res).toMatchObject({ ok: true, data: { deleted: 0 } });
    expect(storage.removeObjects).not.toHaveBeenCalled();
  });
});
