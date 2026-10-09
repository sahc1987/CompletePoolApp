import { clientFieldsSchema } from "@/contracts/clients";
import { requireApi } from "@/server/api/auth";
import { handle, parseBody, respond } from "@/server/api/respond";
import { createClient } from "@/server/services/clients";
import { listClients } from "@/server/services/clientReads";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients?q=&page=&perPage=
 *
 * Admin: the client list, A–Z. `q` matches name, phone, email, billing
 * address and any pool's address — the same search as the web page.
 */
export const GET = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"] });
  if (!auth.ok) return auth.response;

  const params = new URL(req.url).searchParams;
  return respond(
    await listClients(auth.actor, {
      query: params.get("q") ?? "",
      page: Number(params.get("page")) || 1,
      perPage: Math.min(100, Number(params.get("perPage")) || 25),
    })
  );
});

/** POST /api/v1/clients — admin: add a client. Returns { id }. */
export const POST = handle(async (req) => {
  const auth = await requireApi(req, { roles: ["ADMIN"], fresh: true });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, clientFieldsSchema);
  if (!body.ok) return body.response;

  return respond(await createClient(auth.actor, body.data), 201);
});
