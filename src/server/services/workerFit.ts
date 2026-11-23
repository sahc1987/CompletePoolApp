import { prisma } from "@/lib/prisma";
import { ensurePoolLocations } from "@/lib/geocode";
import { occursOn } from "@/lib/recurrence";
import { km } from "@/lib/routeOrder";
import { checkWorkHours, getWorkHours } from "@/lib/schedule";
import {
  addZonedDays,
  parseZonedDate,
  parseZonedDateTime,
  zonedDayKey,
  zonedDayOfWeek,
  zonedDayStart,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/timezone";
import { assertRole, type Actor } from "@/server/actor";
import { invalid, ok, type ServiceResult } from "@/server/result";
import { rankWorkersSchema, type RankWorkersInput, type WorkerFit } from "@/contracts/routePlan";

const SERIES_DAYS = 30; // the same window the recurrence cron fills

/**
 * Judge every active worker for a job that isn't saved yet: free at that time
 * (every visit of a repeating job), how much driving it adds to their day, how
 * busy they already are, and whether they know the client. Best first; workers
 * with a clash go last. Saves nothing.
 */
export async function rankWorkers(
  actor: Actor,
  input: RankWorkersInput
): Promise<ServiceResult<WorkerFit[]>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;
  const parsed = rankWorkersSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);
  const d = parsed.data;

  const hours = await getWorkHours();
  const tz = hours.timezone;
  const first = parseZonedDateTime(d.date, d.time, tz);
  if (!first) return invalid("Pick a valid date and start time");
  const hoursError = checkWorkHours(first, d.durationMin, hours);
  if (hoursError) return invalid(hoursError);

  // Every visit: the first, plus a repeating job's days inside the cron window.
  const visits = [first];
  if (d.repeat !== "NONE") {
    const t = zonedParts(first, tz);
    const rule = {
      frequency: d.repeat,
      daysOfWeek:
        d.repeat === "WEEKLY" || d.repeat === "BIWEEKLY"
          ? d.daysOfWeek.length > 0
            ? d.daysOfWeek
            : [zonedDayOfWeek(first, tz)]
          : [],
      startDate: zonedDayStart(first, tz),
    };
    const until = d.repeatEndDate ? parseZonedDate(d.repeatEndDate, tz) : null;
    const windowEnd = addZonedDays(zonedDayStart(new Date(), tz), SERIES_DAYS, tz);
    for (
      let day = addZonedDays(rule.startDate, 1, tz);
      day <= windowEnd;
      day = addZonedDays(day, 1, tz)
    ) {
      if (until && day > until) break;
      if (!occursOn(rule, day, tz)) continue;
      const c = zonedParts(day, tz);
      visits.push(zonedTimeToUtc(c.year, c.month, c.day, t.hour, t.minute, tz));
    }
  }

  const from = zonedDayStart(visits[0], tz);
  const to = addZonedDays(zonedDayStart(visits[visits.length - 1], tz), 1, tz);
  const [workers, jobs, pool, past] = await Promise.all([
    prisma.user.findMany({
      where: { role: "WORKER", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.task.findMany({
      where: { startTime: { gte: from, lt: to }, status: { not: "CANCELLED" } },
      select: {
        workerId: true,
        startTime: true,
        durationMin: true,
        client: { select: { name: true } },
        pool: { select: { latitude: true, longitude: true } },
      },
    }),
    prisma.pool.findUnique({
      where: { id: d.poolId },
      select: { id: true, clientId: true, latitude: true, longitude: true, geocodedAt: true },
    }),
    prisma.task.findMany({
      where: { clientId: d.clientId, status: { not: "CANCELLED" } },
      orderBy: { startTime: "desc" },
      take: 30,
      select: { workerId: true },
    }),
  ]);
  if (!pool || pool.clientId !== d.clientId) {
    return invalid("That pool doesn't belong to the selected client.");
  }

  let at = { lat: pool.latitude, lng: pool.longitude };
  if (!pool.geocodedAt) {
    await ensurePoolLocations([pool.id]);
    const fresh = await prisma.pool.findUnique({
      where: { id: pool.id },
      select: { latitude: true, longitude: true },
    });
    if (fresh) at = { lat: fresh.latitude, lng: fresh.longitude };
  }

  // Who served this client most often lately.
  const counts = new Map<string, number>();
  for (const t of past) counts.set(t.workerId, (counts.get(t.workerId) ?? 0) + 1);
  const mostSeen = Math.max(0, ...counts.values());

  const dur = d.durationMin * 60_000;
  const day = zonedDayKey(first, tz);
  type Job = (typeof jobs)[number];
  const spot = (j: Job) =>
    j.pool.latitude !== null && j.pool.longitude !== null
      ? { id: "", lat: j.pool.latitude, lng: j.pool.longitude }
      : null;

  const fits: WorkerFit[] = workers.map((w) => {
    const mine = jobs.filter((j) => j.workerId === w.id);

    let clashes = 0;
    let clashNote: string | null = null;
    for (const v of visits) {
      const hit = mine.find((j) => {
        const s = j.startTime.getTime();
        return s < v.getTime() + dur && s + j.durationMin * 60_000 > v.getTime();
      });
      if (!hit) continue;
      clashes++;
      clashNote ??= `Busy with ${hit.client.name} on ${zonedDayKey(v, tz)}`;
    }

    // Driving added by slotting this stop between the stops it would sit between.
    const today = mine
      .filter((j) => zonedDayKey(j.startTime, tz) === day)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    let extraKm: number | null = null;
    if (at.lat !== null && at.lng !== null) {
      const here = { id: "", lat: at.lat, lng: at.lng };
      const before = [...today].reverse().find((j) => j.startTime <= first);
      const after = today.find((j) => j.startTime > first);
      const a = before ? spot(before) : null;
      const b = after ? spot(after) : null;
      if ((before && !a) || (after && !b)) extraKm = null;
      else if (a && b) extraKm = km(a, here) + km(here, b) - km(a, b);
      else if (a || b) extraKm = km((a ?? b)!, here);
      else extraKm = 0;
    }

    const usual = mostSeen > 0 && counts.get(w.id) === mostSeen;
    // ponytail: hand-tuned weights, 1 point per km, 2 per job already that day,
    // 3 off for the usual worker. Make them settings if the crew disagrees.
    const score = (extraKm ?? 10) + today.length * 2 - (usual ? 3 : 0);
    return {
      workerId: w.id,
      name: w.name,
      clashes,
      clashNote,
      extraKm: extraKm === null ? null : Math.round(extraKm * 10) / 10,
      jobsThatDay: today.length,
      usual,
      score: Math.round(score * 10) / 10,
    };
  });

  fits.sort((a, b) => Number(a.clashes > 0) - Number(b.clashes > 0) || a.score - b.score);
  return ok(fits);
}
