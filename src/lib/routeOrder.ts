export type Point = { id: string; lat: number; lng: number };

// Straight-line distance in km; plenty for ordering stops within one town.
function km(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Nearest-neighbour order: the first stop stays where it is (it's where the
 * worker starts the day), then each next stop is the closest one left. Not the
 * mathematically shortest tour, but a sensible one for a day of 5-12 pools.
 */
export function suggestOrder(points: Point[]): string[] {
  if (points.length < 3) return points.map((p) => p.id);
  const left = points.slice(1);
  const order = [points[0]];
  while (left.length > 0) {
    const from = order[order.length - 1];
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (km(from, left[i]) < km(from, left[best])) best = i;
    }
    order.push(left.splice(best, 1)[0]);
  }
  return order.map((p) => p.id);
}

/** Total straight-line distance of visiting `points` in the given order, km. */
export function routeLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += km(points[i - 1], points[i]);
  return total;
}
