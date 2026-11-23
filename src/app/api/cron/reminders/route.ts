import { NextResponse } from "next/server";
import { sendOverdueReminders } from "@/server/services/billReminders";
import { cronRequestAllowed } from "@/server/api/cronAuth";

// Daily overdue-invoice reminders. Does nothing unless an admin has switched
// reminders on in Settings. Runs per request (it sends mail and writes), and
// needs Node for the invoice PDF. Returns counts only, never addresses.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!cronRequestAllowed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendOverdueReminders());
}
