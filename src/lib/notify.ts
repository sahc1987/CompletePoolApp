import { prisma } from "./prisma";

// Fan a message out to every active user as an in-app notification. Optionally
// exclude the actor who triggered the change (they already know) and attach a
// link to jump to the relevant screen.
export async function notifyAll(
  message: string,
  opts?: { link?: string; exceptUserId?: string }
) {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(opts?.exceptUserId ? { id: { not: opts.exceptUserId } } : {}),
    },
    select: { id: true },
  });
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      message,
      link: opts?.link ?? null,
    })),
  });
}
