/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
jest.mock("@/lib/notify", () => ({ notifyUser: jest.fn() }));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

import {
  createUser,
  resetUserPassword,
  setUserRole,
  toggleUserActive,
} from "../users";

const admin: Actor = { id: "admin-1", role: "ADMIN", name: "Ada" };
const owner: Actor = { id: "owner-1", role: "OWNER", name: "Ola" };

const seedTarget = (over: Record<string, unknown> = {}) => {
  prismaMock.user.findUnique.mockResolvedValue({
    id: "target-1",
    name: "Wendy Worker",
    role: "WORKER",
    active: true,
    hourlyRate: null,
    ...over,
  });
};

beforeEach(() => {
  seedTarget();
  // By default there are other managers, so the last-manager guard is inert
  // and each test can opt into it.
  prismaMock.user.count.mockResolvedValue(3);
  prismaMock.user.update.mockResolvedValue({ id: "target-1", active: false });
  prismaMock.user.create.mockResolvedValue({ id: "new-1" });
});

describe("the privilege ladder", () => {
  it("refuses an admin administering another admin", async () => {
    seedTarget({ role: "ADMIN" });
    const res = await setUserRole(admin, {
      userId: "target-1",
      role: "WORKER",
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses an admin administering an owner", async () => {
    seedTarget({ role: "OWNER" });
    const res = await resetUserPassword(admin, {
      userId: "target-1",
      password: "a-long-enough-password",
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("lets an owner administer an admin", async () => {
    seedTarget({ role: "ADMIN" });
    const res = await setUserRole(owner, {
      userId: "target-1",
      role: "WORKER",
    });
    expect(res.ok).toBe(true);
  });

  /**
   * The escalation this ladder exists to stop: promote a worker to owner, then
   * reset that worker's password (workers are administrable) and sign in as an
   * owner.
   */
  it("refuses an admin granting the owner role", async () => {
    const res = await setUserRole(admin, {
      userId: "target-1",
      role: "OWNER",
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses an admin creating an owner account", async () => {
    const res = await createUser(admin, {
      name: "New Owner",
      email: "new@example.com",
      role: "OWNER",
      password: "a-long-enough-password",
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("lets an admin appoint a peer admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null); // email is free
    const res = await createUser(admin, {
      name: "New Admin",
      email: "new@example.com",
      role: "ADMIN",
      password: "a-long-enough-password",
    });
    expect(res.ok).toBe(true);
  });

  it("refuses changing your own role", async () => {
    const res = await setUserRole(admin, { userId: admin.id, role: "WORKER" });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("the last active manager", () => {
  it("can't be demoted out of privilege", async () => {
    seedTarget({ role: "ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(0); // nobody else left
    const res = await setUserRole(owner, {
      userId: "target-1",
      role: "WORKER",
    });
    expect(res).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("can't be disabled", async () => {
    seedTarget({ role: "ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(0);
    const res = await toggleUserActive(owner, { userId: "target-1" });
    expect(res).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("can be demoted once someone else holds privilege", async () => {
    seedTarget({ role: "ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(1);
    const res = await setUserRole(owner, {
      userId: "target-1",
      role: "WORKER",
    });
    expect(res.ok).toBe(true);
  });

  /** A worker is never load-bearing for administration. */
  it("doesn't block disabling a worker", async () => {
    prismaMock.user.count.mockResolvedValue(0);
    const res = await toggleUserActive(admin, { userId: "target-1" });
    expect(res.ok).toBe(true);
  });
});

describe("createUser", () => {
  it("refuses an email already in use", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "someone-else" });
    const res = await createUser(admin, {
      name: "Dup",
      email: "taken@example.com",
      role: "WORKER",
      password: "a-long-enough-password",
    });
    expect(res).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("refuses a short password", async () => {
    const res = await createUser(admin, {
      name: "Short",
      email: "short@example.com",
      role: "WORKER",
      password: "abc",
    });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("stores a hash, never the password itself", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await createUser(admin, {
      name: "Hashed",
      email: "hashed@example.com",
      role: "WORKER",
      password: "a-long-enough-password",
    });
    const data = prismaMock.user.create.mock.calls[0][0].data;
    expect(data.passwordHash).toBeDefined();
    expect(data.passwordHash).not.toBe("a-long-enough-password");
    expect(data).not.toHaveProperty("password");
  });
});
