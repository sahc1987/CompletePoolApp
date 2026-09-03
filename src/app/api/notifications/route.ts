import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildNotificationPayload } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Current user's latest notifications + unread count, plus a live summary of
// their assigned work. Used for the bell's first paint and as the fallback
// when the SSE stream at /api/notifications/stream isn't available.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await buildNotificationPayload(session.user);
  return NextResponse.json(payload);
}

// Mark the user's notifications read. Body: { ids?: string[] } — omit to mark
// all as read.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      read: false,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
