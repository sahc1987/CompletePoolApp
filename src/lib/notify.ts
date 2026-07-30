import { Role } from "@prisma/client";
import { prisma } from "./prisma";

// One notification for one person — used when a change concerns a specific
// worker (their own assignment, their own day) rather than the whole team.
export async function notifyUser(
  userId: string,
  message: string,
  opts?: { link?: string }
) {
  if (!userId) return;
  await prisma.notification.create({
    data: { userId, message, link: opts?.link ?? null },
  });
}

// Fan out to everyone holding one of the given roles. Keeps team-wide schedule
// churn in front of managers without spamming every worker about jobs that
// aren't theirs.
export async function notifyRoles(
  roles: Role[],
  message: string,
  opts?: { link?: string; exceptUserId?: string }
) {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: roles },
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
