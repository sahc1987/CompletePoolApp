/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

/**
 * The phase 7 routes are thin: authenticate, take the id from the path, hand
 * the body to an existing service. These check that wiring — the right id goes
 * to the right service, a body can't smuggle in a different id, and each route
 * turns away the roles the web turns away — without re-testing the services.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
// The bearer token *is* the role, so a test picks who is calling by name.
jest.mock("@/server/api/tokens", () => ({
  verifyAccessToken: jest.fn(async (token: string) => ({ userId: `u-${token}`, role: token })),
}));
jest.mock("@/server/services/materials", () => ({
  adjustStock: jest.fn(async () => ({ ok: true, data: undefined })),
  saveMaterial: jest.fn(async () => ({ ok: true, data: { id: "m1" } })),
  toggleMaterial: jest.fn(async () => ({ ok: true, data: { active: false } })),
  respondMaterialRequest: jest.fn(async () => ({ ok: true, data: undefined })),
}));
jest.mock("@/server/services/users", () => ({
  setUserRole: jest.fn(async () => ({ ok: false, code: "CONFLICT", error: "Last manager." })),
  resetUserPassword: jest.fn(async () => ({ ok: true, data: undefined })),
  saveEmployment: jest.fn(async () => ({ ok: true, data: undefined })),
  toggleUserActive: jest.fn(async () => ({ ok: true, data: { active: false } })),
  createUser: jest.fn(),
}));
jest.mock("@/server/services/kpi", () => ({
  getKpiSummary: jest.fn(async () => ({ ok: true, data: { revenue: 10 } })),
}));
jest.mock("@/server/services/settings", () => ({
  saveService: jest.fn(async () => ({ ok: true, data: { id: "s1" } })),
  deleteService: jest.fn(),
  saveWorkHours: jest.fn(),
  saveExtra: jest.fn(),
  deleteExtra: jest.fn(),
  saveTaxRate: jest.fn(),
  toggleTaxRate: jest.fn(),
}));

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;
const materials = jest.requireMock("@/server/services/materials");
const users = jest.requireMock("@/server/services/users");
const settings = jest.requireMock("@/server/services/settings");

import { POST as stockPOST } from "../materials/[id]/stock/route";
import { POST as respondPOST } from "../material-requests/[id]/respond/route";
import { POST as rolePOST } from "../users/[id]/role/route";
import { PUT as employmentPUT } from "../users/[id]/employment/route";
import { GET as kpiGET } from "../kpi/route";
import { PATCH as servicePATCH } from "../settings/services/[id]/route";

const call = (
  handler: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>,
  role: string,
  params: Record<string, string>,
  body?: unknown
) =>
  handler(
    new Request("https://app.test/api/v1/x", {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${role}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params }
  );

beforeEach(() => {
  // `fresh: true` re-reads the caller; they're active with the token's role.
  prismaMock.user.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    name: "Caller",
    email: "c@x.test",
    role: where.id.replace("u-", ""),
    active: true,
  })) as never);
});

describe("materials", () => {
  it("adjusts the material named in the path, not one in the body", async () => {
    const res = await call(stockPOST, "ADMIN", { id: "m-path" }, {
      materialId: "m-body",
      type: "RESTOCK",
      quantity: 5,
    });
    expect(res.status).toBe(204);
    expect(materials.adjustStock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "ADMIN" }),
      expect.objectContaining({ materialId: "m-path", type: "RESTOCK", quantity: 5 })
    );
  });

  it("keeps workers out of stock", async () => {
    const res = await call(stockPOST, "WORKER", { id: "m1" }, { type: "RESTOCK", quantity: 1 });
    expect(res.status).toBe(403);
    expect(materials.adjustStock).not.toHaveBeenCalled();
  });

  it("rejects a decision that isn't approve or deny before reaching the service", async () => {
    const res = await call(respondPOST, "ADMIN", { id: "r1" }, { decision: "MAYBE" });
    expect(res.status).toBe(400);
    expect(materials.respondMaterialRequest).not.toHaveBeenCalled();
  });
});

describe("team", () => {
  it("passes the service's refusal through with its status", async () => {
    const res = await call(rolePOST, "OWNER", { id: "w1" }, { role: "WORKER" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "CONFLICT", message: "Last manager." } });
    expect(users.setUserRole).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "w1", role: "WORKER" }
    );
  });

  it("saves employment for the user in the path", async () => {
    const res = await employmentPUT(
      new Request("https://app.test/api/v1/users/w9/employment", {
        method: "PUT",
        headers: { authorization: "Bearer ADMIN", "content-type": "application/json" },
        body: JSON.stringify({ hourlyRate: "22.5", hiredOn: "2026-01-05" }),
      }),
      { params: { id: "w9" } }
    );
    expect(res.status).toBe(204);
    expect(users.saveEmployment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "w9", hourlyRate: "22.5", hiredOn: "2026-01-05" })
    );
  });

  it("keeps workers off the team endpoints", async () => {
    const res = await call(rolePOST, "WORKER", { id: "w1" }, { role: "ADMIN" });
    expect(res.status).toBe(403);
  });
});

describe("kpi and settings", () => {
  it("serves KPIs to the owner only", async () => {
    expect((await call(kpiGET, "OWNER", {})).status).toBe(200);
    expect((await call(kpiGET, "ADMIN", {})).status).toBe(403);
  });

  it("edits the service in the path, and the owner can't", async () => {
    const res = await call(servicePATCH, "ADMIN", { id: "s9" }, {
      name: "Weekly clean",
      basePrice: "120",
      defaultDurationMin: "45",
    });
    expect(res.status).toBe(204);
    expect(settings.saveService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "s9", name: "Weekly clean", basePrice: 120, defaultDurationMin: 45 })
    );

    const owner = await call(servicePATCH, "OWNER", { id: "s9" }, { name: "x", basePrice: 1, defaultDurationMin: 1 });
    expect(owner.status).toBe(403);
  });
});
