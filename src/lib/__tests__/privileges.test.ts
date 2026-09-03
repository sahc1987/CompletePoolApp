/**
 * @jest-environment node
 */
import { Role } from "@prisma/client";
import {
  ROLE_RANK,
  ROLE_LABEL,
  canAdminister,
  canGrantRole,
  grantableRoles,
} from "../privileges";

const ROLES: Role[] = ["OWNER", "ADMIN", "WORKER"];

describe("canAdminister", () => {
  it("lets an owner administer everyone below them", () => {
    expect(canAdminister("OWNER", "ADMIN")).toBe(true);
    expect(canAdminister("OWNER", "WORKER")).toBe(true);
  });

  it("lets an admin administer only workers", () => {
    expect(canAdminister("ADMIN", "WORKER")).toBe(true);
    expect(canAdminister("ADMIN", "OWNER")).toBe(false);
  });

  it("gives a worker authority over nobody", () => {
    for (const target of ROLES) {
      expect(canAdminister("WORKER", target)).toBe(false);
    }
  });

  it("never lets peers take each other over", () => {
    // The whole point of ranking: an admin must not reset another admin's
    // password, and no one may administer an owner.
    for (const role of ROLES) {
      expect(canAdminister(role, role)).toBe(false);
    }
  });

  it("is strictly one-directional across every pair", () => {
    for (const a of ROLES) {
      for (const b of ROLES) {
        if (a === b) continue;
        expect(canAdminister(a, b)).toBe(!canAdminister(b, a));
      }
    }
  });
});

describe("canGrantRole", () => {
  it("lets an owner grant any role", () => {
    for (const role of ROLES) expect(canGrantRole("OWNER", role)).toBe(true);
  });

  it("lets an admin appoint a peer but not an owner", () => {
    expect(canGrantRole("ADMIN", "ADMIN")).toBe(true);
    expect(canGrantRole("ADMIN", "WORKER")).toBe(true);
    expect(canGrantRole("ADMIN", "OWNER")).toBe(false);
  });

  it("lets a worker grant nothing above worker", () => {
    expect(canGrantRole("WORKER", "WORKER")).toBe(true);
    expect(canGrantRole("WORKER", "ADMIN")).toBe(false);
    expect(canGrantRole("WORKER", "OWNER")).toBe(false);
  });

  it("never permits escalation above the actor's own rank", () => {
    for (const actor of ROLES) {
      for (const role of ROLES) {
        if (ROLE_RANK[role] > ROLE_RANK[actor]) {
          expect(canGrantRole(actor, role)).toBe(false);
        }
      }
    }
  });
});

describe("grantableRoles", () => {
  it("lists an owner's options highest first", () => {
    expect(grantableRoles("OWNER")).toEqual(["OWNER", "ADMIN", "WORKER"]);
  });

  it("omits owner from an admin's options", () => {
    expect(grantableRoles("ADMIN")).toEqual(["ADMIN", "WORKER"]);
  });

  it("leaves a worker only their own rank", () => {
    expect(grantableRoles("WORKER")).toEqual(["WORKER"]);
  });

  it("agrees with canGrantRole for every actor", () => {
    for (const actor of ROLES) {
      const listed = grantableRoles(actor);
      for (const role of ROLES) {
        expect(listed.includes(role)).toBe(canGrantRole(actor, role));
      }
    }
  });
});

describe("role tables", () => {
  it("labels every role", () => {
    for (const role of ROLES) expect(ROLE_LABEL[role]).toBeTruthy();
  });

  it("ranks every role distinctly", () => {
    const ranks = ROLES.map((r) => ROLE_RANK[r]);
    expect(new Set(ranks).size).toBe(ROLES.length);
  });
});
