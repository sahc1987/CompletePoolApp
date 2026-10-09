import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { listBillsPage, type BillStatusFilter } from "@/server/services/billingReads";

export const dynamic = "force-dynamic";

const STATUSES: BillStatusFilter[] = ["all", "pending", "partial", "paid", "open"];

/**
 * GET /api/v1/bills?status=&clientId=&page=&perPage=
 *
 * Admin and owner (read-only for the owner, as on the web). Newest first, with
 * per-tab counts and billed / collected / outstanding totals. `status` is one
 * of all, pending, partial, paid, or open (anything with a balance).
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN", "OWNER"] });
  if (!auth.ok) return auth.response;

  const params = new URL(req.url).searchParams;
  const status = params.get("status") as BillStatusFilter | null;
  return respond(
    await listBillsPage(auth.actor, {
      status: status && STATUSES.includes(status) ? status : "all",
      clientId: params.get("clientId") || undefined,
      page: Number(params.get("page")) || 1,
      perPage: Number(params.get("perPage")) || 25,
    })
  );
});
