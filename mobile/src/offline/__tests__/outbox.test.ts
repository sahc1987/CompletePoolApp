import { ApiError } from "../../api/client";
import { addPhoto, applyQueue, flush, loadTasks, startTask, submitTask } from "../outbox";

/**
 * The offline queue's promises: an action taken with no signal is kept, shown
 * right away, sent in order when signal returns, and never silently lost.
 */

// A tiny in-memory stand-in for the document directory.
const mockDisk = new Map<string, string>();
jest.mock("expo-file-system", () => ({
  Paths: { document: "doc/" },
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("");
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    create() {
      mockDisk.set(this.uri, "");
    }
    write(s: string) {
      mockDisk.set(this.uri, s);
    }
    async text() {
      return mockDisk.get(this.uri) ?? "";
    }
    delete() {
      mockDisk.delete(this.uri);
    }
    async copy(to: { uri: string }) {
      mockDisk.set(to.uri, mockDisk.get(this.uri) ?? "");
    }
  },
}));
jest.mock("../../api/storage", () => ({ readCachedUser: async () => ({ id: "u1" }) }));
jest.mock("../../api/photos", () => ({
  compressForUpload: async (uri: string) => uri,
  uploadCompressed: jest.fn(),
}));
jest.mock("../../api/endpoints", () => ({
  tasks: { mine: jest.fn(), start: jest.fn(), submit: jest.fn() },
  materials: { usable: jest.fn() },
}));

const { tasks } = jest.requireMock("../../api/endpoints");
const { uploadCompressed } = jest.requireMock("../../api/photos");

const noSignal = () => new ApiError("OFFLINE", "No connection.");
const refused = () => new ApiError("STATE", "This job can't be started.", 422);

const job = (id: string) => ({ id, clientName: `Client ${id}`, status: "SCHEDULED", dayKey: "2026-11-20" });

beforeEach(() => {
  mockDisk.clear();
  jest.resetAllMocks();
});

it("queues a start with no signal and shows the job as started", async () => {
  tasks.start.mockRejectedValue(noSignal());
  await startTask("t1");

  tasks.mine.mockRejectedValue(noSignal());
  // Seed the saved copy the way a successful load would have.
  mockDisk.set("doc/tasks-u1.json", JSON.stringify({
    savedAt: "2026-11-20T12:00:00Z",
    list: { tasks: [job("t1")], businessDay: { timezone: "UTC", today: "2026-11-20", tomorrow: "2026-11-21" } },
  }));

  const res = await loadTasks();
  expect(res.offline).toBe(true);
  expect(res.pending).toBe(1);
  expect(res.list.tasks[0].status).toBe("IN_PROGRESS");
});

it("keeps order and stops while there is still no signal", async () => {
  tasks.start.mockRejectedValue(noSignal());
  tasks.submit.mockRejectedValue(noSignal());
  await startTask("t1");
  await submitTask("t1", []);

  expect(await flush()).toBe(0);
  // Only the first was attempted: the submit must not jump the queue.
  expect(tasks.submit).toHaveBeenCalledTimes(1); // the original attempt only

  tasks.start.mockResolvedValue(undefined);
  tasks.submit.mockResolvedValue(undefined);
  expect(await flush()).toBe(2);
  expect(JSON.parse(mockDisk.get("doc/outbox-u1.json")!).queue).toEqual([]);
});

it("drops a change the server refuses and says so, then carries on", async () => {
  tasks.start.mockRejectedValueOnce(noSignal()).mockRejectedValueOnce(refused());
  tasks.submit.mockRejectedValueOnce(noSignal()).mockResolvedValue(undefined);
  await startTask("t1");
  await submitTask("t2", []);

  expect(await flush()).toBe(1);
  const state = JSON.parse(mockDisk.get("doc/outbox-u1.json")!);
  expect(state.queue).toEqual([]);
  expect(state.failed).toHaveLength(1);
  expect(state.failed[0].message).toContain("can't be started");
});

it("keeps a photo on the phone until it uploads", async () => {
  mockDisk.set("cache/p.jpg", "bytes");
  uploadCompressed.mockRejectedValueOnce(noSignal());
  expect(await addPhoto("t1", "BEFORE", "cache/p.jpg")).toBe("queued");

  uploadCompressed.mockResolvedValue({ id: "ph1" });
  expect(await flush()).toBe(1);
  expect(uploadCompressed).toHaveBeenLastCalledWith("t1", "BEFORE", expect.stringContaining("photo-"));
});

it("shows a queued submit on its own job only", () => {
  const out = applyQueue(
    [job("a"), job("b")] as never,
    [{ id: "1", kind: "submit", taskId: "a", usage: [] }]
  );
  expect(out[0].status).toBe("SUBMITTED");
  expect(out[1].status).toBe("SCHEDULED");
});
