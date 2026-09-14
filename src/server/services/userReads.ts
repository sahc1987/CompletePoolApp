import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/serialize";
import { weeklyHours } from "@/lib/payroll";
import { getBusinessTimezone } from "@/lib/schedule";
import { canAdminister, grantableRoles } from "@/lib/privileges";
import { assertRole, type Actor } from "@/server/actor";
import { ok, type ServiceResult } from "@/server/result";
import { iso, requiredIso } from "@/server/serialize";
import type { RoleValue } from "@/contracts/enums";

export type TeamMemberRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleValue;
  active: boolean;
  hourlyRate: number | null;
  hiredOn: string | null;
  birthday: string | null;
  assignedTaskCount: number;
  /** The actor's own row. You can't change your own role or disable yourself. */
  isSelf: boolean;
  /** The actor outranks them, so the account can be administered at all. */
  administrable: boolean;
  /**
   * The only active admin/owner left. Demoting or disabling them would leave
   * nobody able to administer the system, so the controls are hidden rather
   * than shown and then refused.
   */
  isLastManager: boolean;
  /** True when no account control should be offered for this row. */
  locked: boolean;
};

export type TeamList = {
  members: TeamMemberRow[];
  activeCount: number;
  /** Roles this actor may hand out — up to and including their own rank. */
  grantableRoles: RoleValue[];
};

/**
 * The team list, with each row already told what the actor may do to it.
 *
 * The page previously worked this out inline. Computing it here means the
 * mobile app can't accidentally offer a control the server will refuse — and
 * more importantly, can't accidentally offer one it won't.
 */
export async function listTeam(actor: Actor): Promise<ServiceResult<TeamList>> {
  const denied = assertRole(actor, "ADMIN", "OWNER");
  if (denied) return denied;

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { _count: { select: { tasksAssigned: true } } },
  });

  const activeManagers = users.filter(
    (u) => u.active && (u.role === "ADMIN" || u.role === "OWNER")
  ).length;

  const members = users.map((u) => {
    const isSelf = u.id === actor.id;
    const isLastManager =
      (u.role === "ADMIN" || u.role === "OWNER") &&
      u.active &&
      activeManagers <= 1;
    const administrable = canAdminister(actor.role, u.role);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role as RoleValue,
      active: u.active,
      hourlyRate: toNumber(u.hourlyRate),
      hiredOn: iso(u.hiredOn),
      birthday: iso(u.birthday),
      assignedTaskCount: u._count.tasksAssigned,
      isSelf,
      administrable,
      isLastManager,
      locked: isSelf || isLastManager || !administrable,
    };
  });

  return ok({
    members,
    activeCount: users.filter((u) => u.active).length,
    grantableRoles: grantableRoles(actor.role) as RoleValue[],
  });
}

export type PayRateChangeRow = {
  id: string;
  oldRate: number | null;
  newRate: number;
  changedBy: string | null;
  note: string | null;
  createdAt: string;
};

/** `lib/payroll`'s WorkWeek with its Monday serialized. */
export type PayrollWeek = {
  /** Monday 00:00 of the week, in the business timezone. */
  weekStart: string;
  jobs: number;
  minutes: number;
  hours: number;
  /** hours x the rate, or null when no rate is set. */
  pay: number | null;
};

export type TeamMemberDetail = TeamMemberRow & {
  createdAt: string;
  /** Newest first — an append-only audit trail, never edited. */
  payRateHistory: PayRateChangeRow[];
  /** Most recent weeks worked, in the business timezone. */
  weeks: PayrollWeek[];
  /** The zone the weeks were cut in, so a caller labels them the same way. */
  timezone: string;
  totalMinutes: number;
  totalPay: number;
};

export async function getTeamMember(
  actor: Actor,
  userId: string,
  opts: { weeks?: number } = {}
): Promise<ServiceResult<TeamMemberDetail | null>> {
  const denied = assertRole(actor, "ADMIN", "OWNER");
  if (denied) return denied;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { tasksAssigned: true } },
      payRateHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
    },
  });
  if (!user) return ok(null);

  const activeManagers = await prisma.user.count({
    where: { active: true, role: { in: ["ADMIN", "OWNER"] } },
  });

  const rate = toNumber(user.hourlyRate);
  // Weeks start on the business Monday, not the server's.
  const timezone = await getBusinessTimezone();
  const weeks = await weeklyHours(user.id, {
    weeks: opts.weeks ?? 8,
    hourlyRate: rate,
    timezone,
  });

  const isSelf = user.id === actor.id;
  const isLastManager =
    (user.role === "ADMIN" || user.role === "OWNER") &&
    user.active &&
    activeManagers <= 1;
  const administrable = canAdminister(actor.role, user.role);

  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as RoleValue,
    active: user.active,
    hourlyRate: rate,
    hiredOn: iso(user.hiredOn),
    birthday: iso(user.birthday),
    assignedTaskCount: user._count.tasksAssigned,
    isSelf,
    administrable,
    isLastManager,
    locked: isSelf || isLastManager || !administrable,
    createdAt: requiredIso(user.createdAt),
    payRateHistory: user.payRateHistory.map((h) => ({
      id: h.id,
      oldRate: toNumber(h.oldRate),
      newRate: toNumber(h.newRate) ?? 0,
      changedBy: h.changedBy?.name ?? null,
      note: h.note,
      createdAt: requiredIso(h.createdAt),
    })),
    weeks: weeks.map((w) => ({ ...w, weekStart: requiredIso(w.weekStart) })),
    timezone,
    totalMinutes: weeks.reduce((s, w) => s + w.minutes, 0),
    totalPay: weeks.reduce((s, w) => s + (w.pay ?? 0), 0),
  });
}
