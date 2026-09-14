/**
 * @jest-environment node
 */
import type { Actor } from "@/server/actor";

jest.mock("@/lib/prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));

import * as accountService from "../account";
import * as billingService from "../billing";
import * as clientsService from "../clients";
import * as estimatesService from "../estimates";
import * as materialsService from "../materials";
import * as reviewService from "../review";
import * as schedulingService from "../scheduling";
import * as settingsService from "../settings";
import * as usersService from "../users";
import * as workerService from "../worker";
import * as billingReads from "../billingReads";
import * as clientReads from "../clientReads";
import * as estimateReads from "../estimateReads";
import * as kpiService from "../kpi";
import * as materialReads from "../materialReads";
import * as taskReads from "../taskReads";
import * as userReads from "../userReads";
import * as catalogReads from "../catalogReads";

import type { PrismaMock } from "@/test/prismaMock";

const prismaMock: PrismaMock = jest.requireMock("@/lib/prisma").prisma;

// The mock returns null from every write by default. A service that reports the
// id it created would then throw on `created.id` — which says nothing about
// authorization, so give the writes a row to hand back.
beforeEach(() => {
  for (const model of Object.values(prismaMock)) {
    if (typeof model === "function") continue;
    model.create?.mockResolvedValue({ id: "new-id", active: true });
    model.update?.mockResolvedValue({ id: "new-id", active: true });
  }
});

const actor = (role: Actor["role"]): Actor => ({
  id: `u-${role}`,
  role,
  name: role,
  email: `${role}@example.com`,
});

const OWNER = actor("OWNER");
const ADMIN = actor("ADMIN");
const WORKER = actor("WORKER");

/**
 * Authorization is the property most at risk from this refactor: it used to be
 * `requireRole` at the top of each server action, and the API will not go
 * through those. Every service therefore re-asserts it, and this sweep is what
 * proves the assertion is actually present rather than assumed.
 *
 * The call arguments below are deliberately junk — a role refusal must happen
 * before any input is looked at, so a test that needs valid input to reach the
 * check would be testing the wrong thing.
 */
type Case = {
  name: string;
  call: (a: Actor) => Promise<{ ok: boolean; code?: string }>;
  allowed: Actor[];
  denied: Actor[];
};

const ADMIN_ONLY = { allowed: [ADMIN], denied: [OWNER, WORKER] };
const WORKER_ONLY = { allowed: [WORKER], denied: [ADMIN, OWNER] };
const STAFF = { allowed: [ADMIN, WORKER], denied: [OWNER] };
const MANAGERS = { allowed: [ADMIN, OWNER], denied: [WORKER] };

const cases: Case[] = [
  // --- worker ---
  { name: "worker.startTask", call: (a) => workerService.startTask(a, { taskId: "t1" }), ...WORKER_ONLY },
  { name: "worker.submitTask", call: (a) => workerService.submitTask(a, { taskId: "t1", usage: [] }), ...WORKER_ONLY },
  { name: "worker.createMaterialRequest", call: (a) => workerService.createMaterialRequest(a, { quantityRequested: 1, description: "x" }), ...WORKER_ONLY },
  { name: "taskReads.listMyTasks", call: (a) => taskReads.listMyTasks(a), ...WORKER_ONLY },

  // --- review ---
  { name: "review.approveTask", call: (a) => reviewService.approveTask(a, { taskId: "t1" }), ...ADMIN_ONLY },
  { name: "review.flagTask", call: (a) => reviewService.flagTask(a, { taskId: "t1", reason: "r" }), ...ADMIN_ONLY },
  { name: "taskReads.listReviewQueue", call: (a) => taskReads.listReviewQueue(a), ...ADMIN_ONLY },

  // --- scheduling ---
  { name: "scheduling.createTask", call: (a) => schedulingService.createTask(a, {} as never), ...ADMIN_ONLY },
  { name: "scheduling.editTask", call: (a) => schedulingService.editTask(a, {} as never), ...ADMIN_ONLY },
  { name: "scheduling.rescheduleTask", call: (a) => schedulingService.rescheduleTask(a, {} as never), ...ADMIN_ONLY },
  { name: "scheduling.finishTask", call: (a) => schedulingService.finishTask(a, { taskId: "t1", usage: [] }), ...ADMIN_ONLY },
  { name: "scheduling.runRecurrenceExpansion", call: (a) => schedulingService.runRecurrenceExpansion(a), ...ADMIN_ONLY },

  // --- billing: owner is deliberately read-only over money ---
  { name: "billing.payBill", call: (a) => billingService.payBill(a, {} as never), ...ADMIN_ONLY },
  { name: "billing.reverseBillPayments", call: (a) => billingService.reverseBillPayments(a, {} as never), ...ADMIN_ONLY },
  { name: "billing.chargeTask", call: (a) => billingService.chargeTask(a, {} as never), ...ADMIN_ONLY },
  { name: "billingReads.listBills", call: (a) => billingReads.listBills(a), allowed: [ADMIN, OWNER], denied: [WORKER] },

  // --- clients ---
  { name: "clients.createClient", call: (a) => clientsService.createClient(a, {} as never), ...ADMIN_ONLY },
  { name: "clients.updateClient", call: (a) => clientsService.updateClient(a, {} as never), ...ADMIN_ONLY },
  { name: "clients.deleteClient", call: (a) => clientsService.deleteClient(a, { id: "c1" }), ...ADMIN_ONLY },
  { name: "clients.createPool", call: (a) => clientsService.createPool(a, {} as never), ...ADMIN_ONLY },
  { name: "clients.deletePool", call: (a) => clientsService.deletePool(a, { id: "p1" }), ...ADMIN_ONLY },
  { name: "clientReads.listClients", call: (a) => clientReads.listClients(a), ...ADMIN_ONLY },
  { name: "clientReads.getClient", call: (a) => clientReads.getClient(a, "c1"), ...ADMIN_ONLY },

  // --- materials ---
  { name: "materials.saveMaterial", call: (a) => materialsService.saveMaterial(a, {} as never), ...ADMIN_ONLY },
  { name: "materials.adjustStock", call: (a) => materialsService.adjustStock(a, {} as never), ...ADMIN_ONLY },
  { name: "materials.respondMaterialRequest", call: (a) => materialsService.respondMaterialRequest(a, {} as never), ...ADMIN_ONLY },
  { name: "materialReads.listMaterials", call: (a) => materialReads.listMaterials(a), ...ADMIN_ONLY },
  { name: "materialReads.listPendingMaterialRequests", call: (a) => materialReads.listPendingMaterialRequests(a), ...ADMIN_ONLY },

  // --- settings ---
  { name: "settings.saveService", call: (a) => settingsService.saveService(a, {} as never), ...ADMIN_ONLY },
  { name: "settings.saveWorkHours", call: (a) => settingsService.saveWorkHours(a, {} as never), ...ADMIN_ONLY },
  { name: "settings.saveTaxRate", call: (a) => settingsService.saveTaxRate(a, {} as never), ...ADMIN_ONLY },
  { name: "catalogReads.getBusinessCatalog", call: (a) => catalogReads.getBusinessCatalog(a), ...ADMIN_ONLY },
  { name: "catalogReads.getSchedulingCatalog", call: (a) => catalogReads.getSchedulingCatalog(a), ...ADMIN_ONLY },

  // --- estimates: built by whoever is in front of the customer ---
  { name: "estimates.createEstimate", call: (a) => estimatesService.createEstimate(a, {} as never), ...STAFF },
  { name: "estimates.addLineItem", call: (a) => estimatesService.addLineItem(a, {} as never), ...STAFF },
  { name: "estimates.signEstimate", call: (a) => estimatesService.signEstimate(a, {} as never), ...STAFF },
  { name: "estimates.declineEstimate", call: (a) => estimatesService.declineEstimate(a, {} as never), ...STAFF },
  { name: "estimates.deleteEstimate", call: (a) => estimatesService.deleteEstimate(a, { estimateId: "e1" }), ...STAFF },
  { name: "estimateReads.listEstimates", call: (a) => estimateReads.listEstimates(a), ...STAFF },
  { name: "estimateReads.getEstimate", call: (a) => estimateReads.getEstimate(a, "e1"), ...STAFF },

  // --- team administration: the one place owner is not read-only ---
  { name: "users.saveEmployment", call: (a) => usersService.saveEmployment(a, {} as never), ...MANAGERS },
  { name: "users.setUserRole", call: (a) => usersService.setUserRole(a, {} as never), ...MANAGERS },
  { name: "users.toggleUserActive", call: (a) => usersService.toggleUserActive(a, { userId: "x" }), ...MANAGERS },
  { name: "users.createUser", call: (a) => usersService.createUser(a, {} as never), ...MANAGERS },
  { name: "users.resetUserPassword", call: (a) => usersService.resetUserPassword(a, {} as never), ...MANAGERS },
  { name: "userReads.listTeam", call: (a) => userReads.listTeam(a), ...MANAGERS },
  { name: "userReads.getTeamMember", call: (a) => userReads.getTeamMember(a, "u1"), ...MANAGERS },

  // --- owner-only dashboard ---
  { name: "kpi.getKpiSummary", call: (a) => kpiService.getKpiSummary(a), allowed: [OWNER], denied: [ADMIN, WORKER] },
];

describe("service authorization", () => {
  for (const c of cases) {
    for (const a of c.denied) {
      it(`${c.name} refuses ${a.role}`, async () => {
        const res = await c.call(a);
        expect(res.ok).toBe(false);
        expect(res.code).toBe("FORBIDDEN");
      });
    }

    for (const a of c.allowed) {
      it(`${c.name} lets ${a.role} past the role check`, async () => {
        const res = await c.call(a);
        // The call may still fail on its (deliberately junk) input — what
        // matters is that it failed for a reason other than the role.
        if (!res.ok) expect(res.code).not.toBe("FORBIDDEN");
      });
    }
  }
});

describe("operations that belong to the signed-in user", () => {
  // These identify their row from the actor, so there is no role to check:
  // anyone signed in may read and edit their own profile.
  it("account.getMyProfile is open to every role", async () => {
    for (const a of [OWNER, ADMIN, WORKER]) {
      const res = await accountService.getMyProfile(a);
      expect(res.ok).toBe(true);
    }
  });

  it("account.updateProfile is open to every role", async () => {
    for (const a of [OWNER, ADMIN, WORKER]) {
      const res = await accountService.updateProfile(a, { name: "New Name" });
      expect(res.ok).toBe(true);
    }
  });
});
