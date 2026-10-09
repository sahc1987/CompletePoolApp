/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

/**
 * The demo account is a real ADMIN row that anyone can sign in as, on the live
 * database. These pin down that it can look but never change anything — at
 * both doors every change goes through.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
jest.mock("@/server/api/tokens", () => ({
  verifyAccessToken: jest.fn(async (token: string) => ({ userId: token, role: "ADMIN" })),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const { getServerSession } = jest.requireMock("next-auth");

import { requireReader, requireRole, requireUser } from "../guard";
import { DEMO_EMAIL, isDemoUser } from "../demo";
import { requireApi } from "@/server/api/auth";

const demo = { id: "demo", role: "ADMIN", name: "Demo", email: DEMO_EMAIL };
const admin = { id: "a1", role: "ADMIN", name: "Ana", email: "ana@completepool.com" };

describe("isDemoUser", () => {
  it("matches the demo email regardless of case and spacing, and nothing else", () => {
    expect(isDemoUser({ email: " Demo@CompletePool.app " })).toBe(true);
    expect(isDemoUser({ email: "ana@completepool.com" })).toBe(false);
    expect(isDemoUser({ email: null })).toBe(false);
    expect(isDemoUser(null)).toBe(false);
  });
});

describe("web server actions", () => {
  it("send the demo account to the explanation page instead of changing anything", async () => {
    getServerSession.mockResolvedValue({ user: demo });
    await expect(requireRole("ADMIN")).rejects.toThrow("REDIRECT:/demo");
    await expect(requireUser()).rejects.toThrow("REDIRECT:/demo");
  });

  it("still let it read through the read-only door", async () => {
    getServerSession.mockResolvedValue({ user: demo });
    await expect(requireReader()).resolves.toMatchObject({ email: DEMO_EMAIL });
  });

  it("leave real admins alone", async () => {
    getServerSession.mockResolvedValue({ user: admin });
    await expect(requireRole("ADMIN")).resolves.toMatchObject({ id: "a1" });
  });
});

describe("API", () => {
  const req = (method: string, user: string) =>
    new Request("https://app.test/api/v1/anything", {
      method,
      headers: { authorization: `Bearer ${user}` },
    });

  beforeEach(() => {
    prismaMock.user.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) =>
      where.id === "demo"
        ? { ...demo, active: true }
        : { ...admin, active: true }) as never);
  });

  it("refuses any non-read call from the demo account, even on a route that didn't ask for a fresh check", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const res = await requireApi(req(method, "demo"), { roles: ["ADMIN"] });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.response.status).toBe(403);
        expect((await res.response.json()).error.message).toMatch(/read-only demo/);
      }
    }
  });

  it("lets the demo account read", async () => {
    const res = await requireApi(req("GET", "demo"), { roles: ["ADMIN"] });
    expect(res.ok).toBe(true);
  });

  it("leaves a real admin's writes alone", async () => {
    const res = await requireApi(req("POST", "a1"), { roles: ["ADMIN"], fresh: true });
    expect(res.ok).toBe(true);
  });
});
