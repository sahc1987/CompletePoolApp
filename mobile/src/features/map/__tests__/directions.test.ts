import { directionsForDay, directionsTo, MAX_ROUTE_STOPS } from "../directions";

const stop = (n: number, placed = true) => ({
  address: `${n} Main St`,
  lat: placed ? 40 + n / 100 : null,
  lng: placed ? -73 : null,
});

const params = (url: string) => new URL(url).searchParams;

describe("directions links", () => {
  it("drives to a stop by its exact pin", () => {
    expect(params(directionsTo(stop(1))).get("destination")).toBe("40.01,-73");
  });

  it("falls back to the address when a stop has no pin", () => {
    expect(params(directionsTo(stop(1, false))).get("destination")).toBe("1 Main St");
  });

  it("routes through the day's stops in order, ending at the last", () => {
    const p = params(directionsForDay([stop(1), stop(2), stop(3)])!);
    expect(p.get("waypoints")).toBe("40.01,-73|40.02,-73");
    expect(p.get("destination")).toBe("40.03,-73");
    // No origin: the route starts wherever the worker is standing.
    expect(p.has("origin")).toBe(false);
  });

  it("stays within Google's waypoint limit on a long day", () => {
    const many = Array.from({ length: 14 }, (_, i) => stop(i + 1));
    const p = params(directionsForDay(many)!);
    expect(p.get("waypoints")!.split("|")).toHaveLength(MAX_ROUTE_STOPS - 1);
  });

  it("offers nothing for an empty day", () => {
    expect(directionsForDay([])).toBeNull();
  });
});
