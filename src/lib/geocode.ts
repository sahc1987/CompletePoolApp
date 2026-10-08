import { prisma } from "./prisma";

/**
 * Address → map position, for the calendar's day map.
 *
 * Uses Photon, the same keyless OpenStreetMap geocoder the address autocomplete
 * and the job-location map already use. Results are cached on the Pool, so each
 * address is looked up once rather than in every viewer's browser on every
 * view — which is both faster and within the free service's fair-use limits.
 */

const PHOTON_URL = "https://photon.komoot.io/api/";
const TIMEOUT_MS = 4000;
/** Lookups in flight at once — polite to a free public service. */
const CONCURRENCY = 3;

export type LatLng = { lat: number; lng: number };

/** One address, or null when it can't be found or the service is down. Never throws. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=1`, {
      signal: controller.signal,
      headers: { "User-Agent": "CompletePoolApp/1.0 (day map)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] } }[];
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    // GeoJSON is [lon, lat].
    return { lat: coords[1], lng: coords[0] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up and cache positions for any of these pools that have never been
 * looked up. A pool that can't be found is marked as tried (geocodedAt set,
 * no coordinates) so it isn't retried on every view; changing its address
 * clears that and it's tried again.
 *
 * Capped per call so one map load never waits on dozens of lookups — anything
 * left over is filled in on the next view.
 */
export async function ensurePoolLocations(poolIds: string[], max = 15): Promise<void> {
  if (poolIds.length === 0) return;
  const pending = await prisma.pool.findMany({
    where: { id: { in: [...new Set(poolIds)] }, geocodedAt: null },
    select: { id: true, address: true },
    take: max,
  });

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(
      pending.slice(i, i + CONCURRENCY).map(async (pool) => {
        const point = await geocodeAddress(pool.address);
        await prisma.pool.update({
          where: { id: pool.id },
          data: {
            latitude: point?.lat ?? null,
            longitude: point?.lng ?? null,
            geocodedAt: new Date(),
          },
        });
      })
    );
  }
}
