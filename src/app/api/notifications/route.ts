import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Current user's latest notifications + unread count. Polled by the bell.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  return NextResponse.json({ items, unread });
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
