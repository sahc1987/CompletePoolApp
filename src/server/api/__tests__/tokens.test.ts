/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

// The signing key is derived from this, so it has to exist before the module
// under test reads it.
process.env.NEXTAUTH_SECRET = "test-secret-not-used-anywhere-real";

import {
  ACCESS_TOKEN_TTL_S,
  issueTokens,
  rotateRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../tokens";

const user = { id: "u1", role: "WORKER" as const };

beforeEach(() => {
  prismaMock.refreshToken.create.mockResolvedValue({ id: "rt1" });
  prismaMock.refreshToken.update.mockResolvedValue({ id: "rt1" });
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  // Unconditional, so a failing assertion inside a test that shifted the clock
  // cannot leak that clock into the next one.
  jest.useRealTimers();
});

describe("access tokens", () => {
  it("round-trips the user id and role", async () => {
    const token = await signAccessToken({ userId: "u1", role: "ADMIN" });
    await expect(verifyAccessToken(token)).resolves.toEqual({
      userId: "u1",
      role: "ADMIN",
    });
  });

  it("rejects a token that has been tampered with", async () => {
    const token = await signAccessToken({ userId: "u1", role: "WORKER" });
    const [header, payload, signature] = token.split(".");

    // Re-encode the payload claiming a higher role, keeping the signature.
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    claims.role = "OWNER";
    const forgedPayload = Buffer.from(JSON.stringify(claims)).toString(
      "base64url"
    );

    const forged = `${header}.${forgedPayload}.${signature}`;
    await expect(verifyAccessToken(forged)).resolves.toBeNull();
  });

  it("rejects junk rather than throwing", async () => {
    for (const bad of ["", "not-a-token", "a.b.c", "Bearer x"]) {
      await expect(verifyAccessToken(bad)).resolves.toBeNull();
    }
  });

  it("rejects an expired token", async () => {
    const token = await signAccessToken({ userId: "u1", role: "WORKER" });

    // Past the TTL, with room for jose's small clock tolerance. Fake timers
    // rather than a Date.now spy: afterEach restores them even when an
    // assertion throws, which a spy restored on the last line of the test does
    // not — that leaked a shifted clock into every test after it.
    const future = Date.now() + (ACCESS_TOKEN_TTL_S + 120) * 1000;
    jest.useFakeTimers();
    jest.setSystemTime(future);

    await expect(verifyAccessToken(token)).resolves.toBeNull();
  });
});

describe("issuing a session", () => {
  it("stores a hash of the refresh token, never the token", async () => {
    const tokens = await issueTokens(user);
    const stored = prismaMock.refreshToken.create.mock.calls[0][0].data;

    expect(stored.tokenHash).toBeDefined();
    expect(stored.tokenHash).not.toBe(tokens.refreshToken);
    // A read of the table must not yield anything that can be presented back.
    expect(JSON.stringify(stored)).not.toContain(tokens.refreshToken);
  });

  it("starts a new rotation family per sign-in", async () => {
    await issueTokens(user);
    await issueTokens(user);
    const [first, second] = prismaMock.refreshToken.create.mock.calls;
    expect(first[0].data.familyId).not.toBe(second[0].data.familyId);
  });
});

describe("rotating a refresh token", () => {
  const seedStored = (over: Record<string, unknown> = {}) => {
    prismaMock.refreshToken.findUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) => ({
        id: "rt1",
        tokenHash: where.tokenHash,
        userId: "u1",
        familyId: "fam-1",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        revokedAt: null,
        user: { id: "u1", role: "WORKER", active: true },
        ...over,
      })
    );
  };

  it("issues a new pair and keeps the family", async () => {
    seedStored();
    const res = await rotateRefreshToken("some-token");
    expect(res.ok).toBe(true);
    const created = prismaMock.refreshToken.create.mock.calls.at(-1)![0].data;
    expect(created.familyId).toBe("fam-1");
  });

  it("marks the presented token used, so it can't be replayed", async () => {
    seedStored();
    await rotateRefreshToken("some-token");
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rt1" },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      })
    );
  });

  /**
   * The point of rotation. If a token is presented twice, two parties hold the
   * lineage and one of them stole it — and we can't tell which, so both lose it.
   */
  it("revokes the whole family when an already-used token is replayed", async () => {
    seedStored({ usedAt: new Date() });
    const res = await rotateRefreshToken("some-token");
    expect(res).toEqual({ ok: false, reason: "reused" });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: "fam-1", revokedAt: null },
      })
    );
  });

  it("refuses an expired token", async () => {
    seedStored({ expiresAt: new Date(Date.now() - 1000) });
    const res = await rotateRefreshToken("some-token");
    expect(res).toEqual({ ok: false, reason: "invalid" });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it("refuses a revoked token", async () => {
    seedStored({ revokedAt: new Date() });
    const res = await rotateRefreshToken("some-token");
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses an unknown token", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    const res = await rotateRefreshToken("never-issued");
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses an empty token without querying", async () => {
    const res = await rotateRefreshToken("");
    expect(res).toEqual({ ok: false, reason: "invalid" });
    expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  /**
   * Refresh is where a deactivation lands on a device, since the access token
   * asserts its role for up to 15 minutes regardless.
   */
  it("refuses and revokes everything when the account is disabled", async () => {
    seedStored({ user: { id: "u1", role: "WORKER", active: false } });
    const res = await rotateRefreshToken("some-token");
    expect(res).toEqual({ ok: false, reason: "revoked" });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } })
    );
  });

  it("re-reads the role rather than carrying the old one forward", async () => {
    // Promoted since the token was minted.
    seedStored({ user: { id: "u1", role: "ADMIN", active: true } });
    const res = await rotateRefreshToken("some-token");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await expect(verifyAccessToken(res.tokens.accessToken)).resolves.toEqual({
      userId: "u1",
      role: "ADMIN",
    });
  });
});
