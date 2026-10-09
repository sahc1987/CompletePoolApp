import { requireApi } from "@/server/api/auth";
import { handle, respond } from "@/server/api/respond";
import { listBillsPage, type BillStatusFilter } from "@/server/services/billingReads";

export const dynamic = "force-dynamic";

const STATUSES: BillStatusFilter[] = ["all", "pending", "partial", "paid", "open"];

/**
 * GET /api/v1/bills?status=&clientId=&range=&from=&to=&page=&perPage=
 *
 * Admin and owner (read-only for the owner, as on the web). Newest first, with
 * per-tab counts and billed / collected / outstanding totals. `status` is one
 * of all, pending, partial, paid, or open (anything with a balance). `range` is
 * all, day, week, month or custom, with `from`/`to` as YYYY-MM-DD in the
 * business zone (`from` alone picks the day) — the same periods as the web.
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
      range: params.get("range"),
      from: params.get("from"),
      to: params.get("to"),
      page: Number(params.get("page")) || 1,
      perPage: Number(params.get("perPage")) || 25,
    })
  );
});
