/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;

import {
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_SECONDS,
  MAX_SOURCE_FAILURES,
  throttleKey,
  getThrottleState,
  isLockedOut,
  recordFailure,
  clearFailures,
  clientIp,
  isSourceBlocked,
  recordSourceFailure,
  clearSourceFailures,
} from "../loginThrottle";

const NOW = new Date("2024-07-04T12:00:00Z");

/** What recordFailure/recordSourceFailure wrote, as sent to `upsert`. */
const upserted = (model: "loginAttempt" | "loginSource") =>
  prismaMock[model].upsert.mock.calls[0][0].update;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  // upsert echoes back what it was told to write, like the real client.
  prismaMock.loginAttempt.upsert.mockImplementation(async (args: any) => ({
    email: args.where.email,
    ...args.update,
  }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("throttleKey", () => {
  it("folds case and whitespace into one bucket", () => {
    expect(throttleKey(" Sam@X.com ")).toBe("sam@x.com");
    expect(throttleKey("SAM@X.COM")).toBe(throttleKey("sam@x.com"));
  });
});

describe("getThrottleState", () => {
  it("gives an untouched address a full set of attempts", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    await expect(getThrottleState("sam@x.com")).resolves.toEqual({
      lockedSeconds: 0,
      attemptsLeft: MAX_LOGIN_ATTEMPTS,
    });
  });

  it("counts down the attempts already spent", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      failedCount: 2,
      lockedUntil: null,
    });
    await expect(getThrottleState("sam@x.com")).resolves.toEqual({
      lockedSeconds: 0,
      attemptsLeft: MAX_LOGIN_ATTEMPTS - 2,
    });
  });

  it("reports the seconds left on an active lock", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      failedCount: 0,
      lockedUntil: new Date(NOW.getTime() + 20_000),
    });
    await expect(getThrottleState("sam@x.com")).resolves.toEqual({
      lockedSeconds: 20,
      attemptsLeft: 0,
    });
  });

  it("never reports more than the full lockout", async () => {
    // A corrupt or hand-edited far-future lock must not show an absurd wait.
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      failedCount: 0,
      lockedUntil: new Date(NOW.getTime() + 86_400_000),
    });
    expect((await getThrottleState("sam@x.com")).lockedSeconds).toBe(LOCKOUT_SECONDS);
  });

  it("ignores a lock that has already expired", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      failedCount: 0,
      lockedUntil: new Date(NOW.getTime() - 1000),
    });
    await expect(getThrottleState("sam@x.com")).resolves.toEqual({
      lockedSeconds: 0,
      attemptsLeft: MAX_LOGIN_ATTEMPTS,
    });
  });

  it("looks the same for an unknown address as for a real untried one", async () => {
    // The state must not leak whether the account exists.
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    const unknown = await getThrottleState("nobody@x.com");
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    expect(await getThrottleState("sam@x.com")).toEqual(unknown);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("normalises the address before looking it up", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    await getThrottleState(" Sam@X.com ");
    expect(prismaMock.loginAttempt.findUnique.mock.calls[0][0].where.email).toBe(
      "sam@x.com"
    );
  });
});

describe("isLockedOut", () => {
  it("is true inside the lock window", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      failedCount: 0,
      lockedUntil: new Date(NOW.getTime() + 5000),
    });
    await expect(isLockedOut("sam@x.com")).resolves.toBe(true);
  });

  it("is false once the window has passed", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      failedCount: 0,
      lockedUntil: new Date(NOW.getTime() - 1),
    });
    await expect(isLockedOut("sam@x.com")).resolves.toBe(false);
  });
});

describe("recordFailure", () => {
  it("counts the first failure without locking", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    const state = await recordFailure("sam@x.com");
    expect(upserted("loginAttempt")).toEqual({ failedCount: 1, lockedUntil: null });
    expect(state).toEqual({ lockedSeconds: 0, attemptsLeft: MAX_LOGIN_ATTEMPTS - 1 });
  });

  it("locks on the final allowed failure", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      email: "sam@x.com",
      failedCount: MAX_LOGIN_ATTEMPTS - 1,
      lockedUntil: null,
    });
    const state = await recordFailure("sam@x.com");
    const written = upserted("loginAttempt");
    expect(written.lockedUntil).toEqual(new Date(NOW.getTime() + LOCKOUT_SECONDS * 1000));
    // The counter resets with the lock, so the next round gets a full set of
    // attempts instead of locking on every subsequent try.
    expect(written.failedCount).toBe(0);
    expect(state).toEqual({ lockedSeconds: LOCKOUT_SECONDS, attemptsLeft: 0 });
  });

  it("starts a fresh round after a spent lock", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      email: "sam@x.com",
      failedCount: 2,
      lockedUntil: new Date(NOW.getTime() - 1000),
    });
    await recordFailure("sam@x.com");
    expect(upserted("loginAttempt")).toEqual({ failedCount: 1, lockedUntil: null });
  });

  it("keeps counting inside an unexpired round", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue({
      email: "sam@x.com",
      failedCount: 1,
      lockedUntil: null,
    });
    await recordFailure("sam@x.com");
    expect(upserted("loginAttempt").failedCount).toBe(2);
  });

  it("buckets by the normalised address", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    await recordFailure(" SAM@X.com ");
    expect(prismaMock.loginAttempt.upsert.mock.calls[0][0].where.email).toBe("sam@x.com");
  });

  it("sweeps stale rows on the failure path", async () => {
    prismaMock.loginAttempt.findUnique.mockResolvedValue(null);
    await recordFailure("sam@x.com");
    const cutoff =
      prismaMock.loginAttempt.deleteMany.mock.calls[0][0].where.updatedAt.lt;
    expect(cutoff.getTime()).toBeLessThan(NOW.getTime());
  });
});

describe("clearFailures", () => {
  it("wipes the address's strikes on a successful sign-in", async () => {
    await clearFailures(" Sam@X.com ");
    expect(prismaMock.loginAttempt.deleteMany).toHaveBeenCalledWith({
      where: { email: "sam@x.com" },
    });
  });
});

describe("clientIp", () => {
  const headerObj = (h: Record<string, string | string[]>) => h;
  const headerBag = (h: Record<string, string>) => ({
    get: (k: string) => h[k] ?? null,
  });

  it("takes the first entry of x-forwarded-for", async () => {
    // The proxy appends; the first hop is the real client.
    expect(clientIp(headerBag({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe(
      "203.0.113.7"
    );
  });

  it("trims whitespace around the address", () => {
    expect(clientIp(headerBag({ "x-forwarded-for": "  203.0.113.7  " }))).toBe(
      "203.0.113.7"
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(headerBag({ "x-real-ip": " 203.0.113.9 " }))).toBe("203.0.113.9");
  });

  it("falls back past an empty x-forwarded-for", () => {
    expect(
      clientIp(headerBag({ "x-forwarded-for": "  ", "x-real-ip": "203.0.113.9" }))
    ).toBe("203.0.113.9");
  });

  it("reports 'unknown' when no header identifies the caller", () => {
    expect(clientIp(headerBag({}))).toBe("unknown");
  });

  it("reads a plain object of headers too", () => {
    expect(clientIp(headerObj({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("reads the first value of a repeated header", () => {
    expect(clientIp(headerObj({ "x-forwarded-for": ["203.0.113.7", "10.0.0.1"] }))).toBe(
      "203.0.113.7"
    );
  });
});

describe("per-source throttling", () => {
  it("blocks a source inside its lock window", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue({
      lockedUntil: new Date(NOW.getTime() + 60_000),
    });
    await expect(isSourceBlocked("203.0.113.7")).resolves.toBe(true);
  });

  it("does not block a source whose lock has lapsed", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue({
      lockedUntil: new Date(NOW.getTime() - 1),
    });
    await expect(isSourceBlocked("203.0.113.7")).resolves.toBe(false);
  });

  it("does not block an unseen source", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue(null);
    await expect(isSourceBlocked("203.0.113.7")).resolves.toBe(false);
  });

  it("counts the first failure from a new source", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue(null);
    await recordSourceFailure("203.0.113.7");
    expect(upserted("loginSource")).toMatchObject({
      failedCount: 1,
      lockedUntil: null,
    });
  });

  it("keeps counting inside the window", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue({
      ip: "203.0.113.7",
      failedCount: 5,
      windowStart: new Date(NOW.getTime() - 60_000),
      lockedUntil: null,
    });
    await recordSourceFailure("203.0.113.7");
    expect(upserted("loginSource").failedCount).toBe(6);
  });

  it("locks the source once the budget is spent", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue({
      ip: "203.0.113.7",
      failedCount: MAX_SOURCE_FAILURES - 1,
      windowStart: new Date(NOW.getTime() - 60_000),
      lockedUntil: null,
    });
    await recordSourceFailure("203.0.113.7");
    const written = upserted("loginSource");
    expect(written.lockedUntil).toBeInstanceOf(Date);
    expect(written.lockedUntil.getTime()).toBeGreaterThan(NOW.getTime());
    expect(written.failedCount).toBe(0);
  });

  it("restarts the tally once the window has rolled past", async () => {
    // A crew fumbling passwords over a whole morning must not accumulate
    // toward a shared-office lockout.
    prismaMock.loginSource.findUnique.mockResolvedValue({
      ip: "203.0.113.7",
      failedCount: MAX_SOURCE_FAILURES - 1,
      windowStart: new Date(NOW.getTime() - 60 * 60 * 1000),
      lockedUntil: null,
    });
    await recordSourceFailure("203.0.113.7");
    const written = upserted("loginSource");
    expect(written.failedCount).toBe(1);
    expect(written.windowStart).toEqual(NOW);
  });

  it("restarts the tally after a spent lock", async () => {
    prismaMock.loginSource.findUnique.mockResolvedValue({
      ip: "203.0.113.7",
      failedCount: 10,
      windowStart: new Date(NOW.getTime() - 60_000),
      lockedUntil: new Date(NOW.getTime() - 1),
    });
    await recordSourceFailure("203.0.113.7");
    expect(upserted("loginSource")).toMatchObject({ failedCount: 1, lockedUntil: null });
  });

  it("clears a source's tally on a correct sign-in", async () => {
    await clearSourceFailures("203.0.113.7");
    expect(prismaMock.loginSource.deleteMany).toHaveBeenCalledWith({
      where: { ip: "203.0.113.7" },
    });
  });
});
