/**
 * Google Maps links for one stop or a whole day — the same "Maps URLs" scheme
 * the web Map tab uses. No API key; on a phone they open the Google Maps app
 * if it's installed, the browser otherwise. The origin is left out so the
 * route starts wherever the worker is.
 */

export type DirectionStop = { address: string; lat: number | null; lng: number | null };

/** Maps URLs allow 9 waypoints between origin and destination. */
export const MAX_ROUTE_STOPS = 10;

const place = (s: DirectionStop) =>
  s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : s.address;

const url = (params: Record<string, string>) =>
  `https://www.google.com/maps/dir/?${Object.entries({ api: "1", travelmode: "driving", ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}`;

export function directionsTo(stop: DirectionStop): string {
  return url({ destination: place(stop) });
}

export function directionsForDay(stops: DirectionStop[]): string | null {
  if (stops.length === 0) return null;
  const route = stops.slice(0, MAX_ROUTE_STOPS);
  const waypoints = route.slice(0, -1).map(place);
  return url({
    destination: place(route[route.length - 1]!),
    ...(waypoints.length ? { waypoints: waypoints.join("|") } : {}),
  });
}
