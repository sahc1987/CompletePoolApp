import { File, Paths } from "expo-file-system";
import type { PhotoTypeValue } from "@contracts/enums";
import type { MaterialUsageInput } from "@contracts/worker";
import { ApiError } from "../api/client";
import {
  materials as materialsApi,
  tasks as tasksApi,
  type MaterialOption,
  type TaskListResponse,
  type WorkerTask,
} from "../api/endpoints";
import { compressForUpload, uploadCompressed } from "../api/photos";
import { readCachedUser } from "../api/storage";

/**
 * Working with no signal.
 *
 * Three pieces, kept in one file because they share one idea:
 *  - a saved copy of the last job list and material catalog, shown when the
 *    phone can't reach the server;
 *  - an outbox of what the worker did meanwhile (start, submit, photos);
 *  - a flush that replays the outbox, oldest first, whenever signal is back.
 *
 * "Offline" is simply "the request never reached the server" (ApiError
 * OFFLINE, status 0). There is no network-status module on purpose: adding a
 * native module would need a new APK, and this ships over the air.
 *
 * Replays are safe because the server treats a repeated start/submit as done
 * (src/server/services/worker.ts), so a request whose reply was lost can be
 * sent again without counting stock twice.
 *
 * Files are per signed-in user so a shared phone never shows or sends
 * someone else's work. They live in the app's document directory, which is
 * private to the app (this is not where tokens go — those stay in SecureStore).
 */

export type QueueItem =
  | { id: string; kind: "start"; taskId: string }
  | { id: string; kind: "submit"; taskId: string; usage: MaterialUsageInput[] }
  | { id: string; kind: "photo"; taskId: string; type: PhotoTypeValue; uri: string };

type NewItem = QueueItem extends infer I ? (I extends unknown ? Omit<I, "id"> : never) : never;

/** Something the server refused for good when it was replayed. */
export type SyncFailure = {
  id: string;
  taskId: string;
  kind: QueueItem["kind"];
  message: string;
};

type State = { queue: QueueItem[]; failed: SyncFailure[] };
type TasksCache = { savedAt: string; list: TaskListResponse<WorkerTask> };

const EMPTY: State = { queue: [], failed: [] };

// --- Disk --------------------------------------------------------------------

async function fileFor(name: string): Promise<File | null> {
  const user = await readCachedUser();
  return user ? new File(Paths.document, `${name}-${user.id}.json`) : null;
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const f = await fileFor(name);
    return f?.exists ? (JSON.parse(await f.text()) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Throws on failure: a queued action that can't be saved must not look saved. */
async function writeJson(name: string, value: unknown): Promise<void> {
  const f = await fileFor(name);
  if (!f) throw new Error("Not signed in.");
  if (!f.exists) f.create();
  f.write(JSON.stringify(value));
}

const readState = () => readJson<State>("outbox", EMPTY);

// One read-modify-write at a time. Without this, a tap that queues while a
// flush is finishing would read the old file and overwrite the other's change.
let lock: Promise<unknown> = Promise.resolve();
function mutate(fn: (s: State) => void): Promise<void> {
  const run = lock.then(async () => {
    const s = await readState();
    const next: State = { queue: [...s.queue], failed: [...s.failed] };
    fn(next);
    await writeJson("outbox", next);
  });
  lock = run.catch(() => {});
  return run;
}

const enqueue = (item: NewItem) =>
  mutate((s) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    s.queue.push({ ...item, id } as QueueItem);
  });

// --- Deciding what "offline" and "try again later" mean -----------------------

const isOffline = (e: unknown) =>
  e instanceof ApiError && e.code === "OFFLINE" && e.status === 0;

/**
 * Keep the item and stop (still no signal, server hiccup, or session needing a
 * refresh) versus drop it and tell the worker (the server said no). Anything
 * unrecognised is kept: losing a worker's job data is worse than retrying.
 */
function retryLater(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  if (e.code === "UNAUTHENTICATED") return true;
  // The photo uploader reports a storage 4xx as OFFLINE with a status.
  if (e.code === "OFFLINE") return e.status === 0 || e.status >= 500;
  return e.retryable;
}

// --- Flush ---------------------------------------------------------------------

async function send(item: QueueItem): Promise<void> {
  if (item.kind === "start") return tasksApi.start(item.taskId);
  if (item.kind === "submit") return tasksApi.submit(item.taskId, item.usage);
  if (!new File(item.uri).exists) {
    throw new ApiError("NOT_FOUND", "The photo file was lost before it could upload.");
  }
  await uploadCompressed(item.taskId, item.type, item.uri);
}

let running: Promise<number> | null = null;

/** Replay the outbox, oldest first. Returns how many items synced. Single-flight. */
export function flush(): Promise<number> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<number> {
  let done = 0;
  for (;;) {
    const item = (await readState()).queue[0];
    if (!item) return done;

    let failure: SyncFailure | null = null;
    try {
      await send(item);
      done++;
    } catch (e) {
      // Stop at the first item that can't go: later ones may depend on it
      // (a submit after its start), so order is kept.
      if (retryLater(e)) return done;
      const cached = await readJson<TasksCache | null>("tasks", null);
      const who = cached?.list.tasks.find((t) => t.id === item.taskId)?.clientName;
      const why = e instanceof ApiError ? e.message : "It couldn't be sent.";
      failure = { id: item.id, taskId: item.taskId, kind: item.kind, message: who ? `${who}: ${why}` : why };
    }

    await mutate((s) => {
      s.queue = s.queue.filter((i) => i.id !== item.id);
      if (failure) s.failed.push(failure);
    });
    if (item.kind === "photo") {
      try {
        new File(item.uri).delete();
      } catch {
        // Already gone: nothing to clean up.
      }
    }
  }
}

// --- What the screens call ---------------------------------------------------------

/** Start a job; with no signal it is queued and the screen carries on. */
export async function startTask(taskId: string): Promise<void> {
  try {
    await tasksApi.start(taskId);
  } catch (e) {
    if (!isOffline(e)) throw e;
    await enqueue({ kind: "start", taskId });
  }
}

export async function submitTask(taskId: string, usage: MaterialUsageInput[]): Promise<void> {
  try {
    await tasksApi.submit(taskId, usage);
  } catch (e) {
    if (!isOffline(e)) throw e;
    await enqueue({ kind: "submit", taskId, usage });
  }
}

/** Take a photo: uploaded now if possible, otherwise kept on the phone and queued. */
export async function addPhoto(
  taskId: string,
  type: PhotoTypeValue,
  localUri: string
): Promise<"uploaded" | "queued"> {
  const compressed = await compressForUpload(localUri);
  try {
    await uploadCompressed(taskId, type, compressed);
    return "uploaded";
  } catch (e) {
    if (!isOffline(e)) throw e;
    // The compressed file sits in the cache directory, which the system may
    // empty. Copy it somewhere it stays until it has uploaded.
    const keep = new File(Paths.document, `photo-${Date.now().toString(36)}.jpg`);
    await new File(compressed).copy(keep);
    await enqueue({ kind: "photo", taskId, type, uri: keep.uri });
    return "queued";
  }
}

/** Show a queued start/submit on the job right away, before the server knows. */
export function applyQueue(tasks: WorkerTask[], queue: QueueItem[]): WorkerTask[] {
  return tasks.map((t) => {
    let status = t.status;
    for (const i of queue) {
      if (i.taskId !== t.id) continue;
      if (i.kind === "start") status = "IN_PROGRESS";
      if (i.kind === "submit") status = "SUBMITTED";
    }
    return status === t.status ? t : { ...t, status };
  });
}

export type LoadedTasks = {
  list: TaskListResponse<WorkerTask>;
  /** True when this is the saved copy, not what the server just said. */
  offline: boolean;
  /** ISO time the saved copy was taken; null when the data is live. */
  savedAt: string | null;
  /** Changes still waiting to reach the server. */
  pending: number;
  failures: SyncFailure[];
};

/**
 * The worker's jobs: live if reachable (replaying the outbox first), else the
 * saved copy. Queued changes are overlaid either way.
 *
 * ponytail: "today" offline is whatever the saved copy said. If the phone stays
 * offline past midnight the day headings lag until it reconnects — the app does
 * no date arithmetic, by design (see mobile/README.md).
 */
export async function loadTasks(): Promise<LoadedTasks> {
  let list: TaskListResponse<WorkerTask>;
  let offline = false;
  let savedAt: string | null = null;

  try {
    list = await tasksApi.mine();
    if ((await readState()).queue.length > 0 && (await flush()) > 0) {
      list = await tasksApi.mine();
    }
    void writeJson("tasks", { savedAt: new Date().toISOString(), list }).catch(() => {});
  } catch (e) {
    if (!isOffline(e)) throw e;
    const cached = await readJson<TasksCache | null>("tasks", null);
    if (!cached) throw e;
    ({ list, savedAt } = cached);
    offline = true;
  }

  const state = await readState();
  return {
    list: { ...list, tasks: applyQueue(list.tasks, state.queue) },
    offline,
    savedAt,
    pending: state.queue.length,
    failures: state.failed,
  };
}

/** The material list for the submit form, saved the same way. */
export async function loadCatalog(): Promise<MaterialOption[]> {
  try {
    const mats = await materialsApi.usable();
    void writeJson("materials", mats).catch(() => {});
    return mats;
  } catch (e) {
    const saved = isOffline(e) ? await readJson<MaterialOption[] | null>("materials", null) : null;
    if (saved) return saved;
    throw e;
  }
}

export async function queuedPhotoCount(taskId: string): Promise<number> {
  const { queue } = await readState();
  return queue.filter((i) => i.kind === "photo" && i.taskId === taskId).length;
}

export const dismissFailures = () =>
  mutate((s) => {
    s.failed = [];
  });
