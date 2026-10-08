/**
 * Google Maps links for driving to one stop or a whole day's stops.
 *
 * These use the public "Maps URLs" scheme, which needs no API key and opens
 * the Google Maps app on a phone. The origin is left out on purpose, so the
 * route starts from wherever the person opening it is.
 */

export type DirectionStop = {
  address: string;
  lat: number | null;
  lng: number | null;
};

/**
 * Maps URLs accept at most 9 waypoints between origin and destination; a day
 * with more stops than that gets directions for its first 10.
 */
export const MAX_ROUTE_STOPS = 10;

/** Coordinates when we have them (exact pin), otherwise the address text. */
function place(s: DirectionStop): string {
  return s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : s.address;
}

/** Directions to a single stop. */
export function directionsTo(stop: DirectionStop): string {
  const params = new URLSearchParams({ api: "1", destination: place(stop), travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Directions through the stops in the order given (already in visit order).
 * Null for an empty day.
 */
export function directionsForDay(stops: DirectionStop[]): string | null {
  if (stops.length === 0) return null;
  const route = stops.slice(0, MAX_ROUTE_STOPS);
  const destination = route[route.length - 1];
  const waypoints = route.slice(0, -1).map(place);

  const params = new URLSearchParams({ api: "1", destination: place(destination), travelmode: "driving" });
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}
