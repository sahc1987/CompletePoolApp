/**
 * The HTTP client every screen goes through.
 *
 * These pin down the behaviour a worker actually feels: a dead connection must
 * end in a message rather than a spinner that never stops, the server's own
 * error text must reach the screen, and an expired token must be refreshed
 * exactly once however many screens ask at the same moment.
 */

jest.mock("../storage", () => ({
  readSession: jest.fn(),
  writeSession: jest.fn(),
  clearSession: jest.fn(),
}));

import { api, ApiError } from "../client";
import { readSession, writeSession } from "../storage";

const fetchMock = jest.fn();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = "https://api.test";
});

beforeEach(() => {
  jest.useRealTimers();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (readSession as jest.Mock).mockResolvedValue({ accessToken: "old", refreshToken: "r1" });
  (writeSession as jest.Mock).mockResolvedValue(undefined);
});

const json = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
  json: async () => body,
});

/**
 * A request that never answers, but stops when aborted — including when the
 * signal is already aborted on arrival, as real fetch does.
 */
const hang = (_url: string, init: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    if (init.signal?.aborted) return reject(new Error("aborted"));
    init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

/** Settle a request to the ApiError it was rejected with. */
const failure = (p: Promise<unknown>) => p.then(
  () => { throw new Error("expected the request to fail"); },
  (e: unknown) => e as ApiError
);

describe("a stalled connection", () => {
  it("gives up after 20 seconds with a message instead of spinning forever", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(hang);

    const result = failure(api.get("/tasks?view=mine"));
    await jest.advanceTimersByTimeAsync(20_000);

    const err = await result;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("OFFLINE");
    expect(err.message).toMatch(/No connection/);
  });

  it("still lets a screen cancel its own request", async () => {
    fetchMock.mockImplementation(hang);
    const controller = new AbortController();
    const result = failure(api.get("/tasks", { signal: controller.signal }));
    controller.abort();
    expect((await result).code).toBe("OFFLINE");
  });
});

describe("answers from the server", () => {
  it("passes the server's own error message through to the screen", async () => {
    fetchMock.mockResolvedValue(
      json(401, { error: { code: "UNAUTHENTICATED", message: "That email or password isn't right." } })
    );
    const err = await failure(
      api.post("/auth/login", { email: "a@b.c", password: "x" }, { anonymous: true })
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("That email or password isn't right.");
  });

  it("refreshes an expired token once, however many requests hit it together", async () => {
    let refreshes = 0;
    fetchMock.mockImplementation(async (url: string, init: { headers?: Record<string, string> }) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        return json(200, { accessToken: "new", refreshToken: "r2" });
      }
      // The old token is rejected; the refreshed one works.
      return init.headers?.authorization === "Bearer new"
        ? json(200, { ok: true })
        : json(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    });

    const results = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    // Two refreshes would look like a stolen token to the server and sign the
    // worker out.
    expect(refreshes).toBe(1);
  });
});
