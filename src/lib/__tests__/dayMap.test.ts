/**
 * @jest-environment node
 */
import type { PrismaMock } from "@/test/prismaMock";

jest.mock("../prisma", () => ({
  prisma: require("@/test/prismaMock").createPrismaMock(),
}));
const prismaMock: PrismaMock = jest.requireMock("../prisma").prisma;

import { ensurePoolLocations, geocodeAddress } from "../geocode";
import { directionsForDay, directionsTo, MAX_ROUTE_STOPS } from "../directions";

const fetchMock = jest.fn();
beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

const photon = (coords?: [number, number]) => ({
  ok: true,
  json: async () => ({ features: coords ? [{ geometry: { coordinates: coords } }] : [] }),
});

describe("geocodeAddress", () => {
  it("reads Photon's [lon, lat] into lat/lng", async () => {
    fetchMock.mockResolvedValue(photon([-73.5, 40.7]));
    expect(await geocodeAddress("1 Palm Way")).toEqual({ lat: 40.7, lng: -73.5 });
  });

  it("returns null for an address it can't find", async () => {
    fetchMock.mockResolvedValue(photon());
    expect(await geocodeAddress("nowhere")).toBeNull();
  });

  it("never throws when the service is down", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await geocodeAddress("1 Palm Way")).toBeNull();
  });
});

describe("ensurePoolLocations", () => {
  it("caches found and not-found results so neither is looked up again", async () => {
    prismaMock.pool.findMany.mockResolvedValue([
      { id: "found", address: "1 Palm Way" },
      { id: "missing", address: "nowhere" },
    ]);
    fetchMock
      .mockResolvedValueOnce(photon([-73.5, 40.7]))
      .mockResolvedValueOnce(photon());

    await ensurePoolLocations(["found", "missing"]);

    const updates = prismaMock.pool.update.mock.calls.map((c) => c[0]);
    expect(updates[0]).toMatchObject({ where: { id: "found" }, data: { latitude: 40.7, longitude: -73.5 } });
    expect(updates[1]).toMatchObject({ where: { id: "missing" }, data: { latitude: null, longitude: null } });
    for (const u of updates) expect(u.data.geocodedAt).toBeInstanceOf(Date);
    // Only pools never looked up are fetched.
    expect(prismaMock.pool.findMany.mock.calls[0][0].where.geocodedAt).toBeNull();
  });
});

describe("directions links", () => {
  const stop = (n: number, placed = true) => ({
    address: `${n} Main St`,
    lat: placed ? 40 + n / 100 : null,
    lng: placed ? -73 : null,
  });

  it("drives to one stop by its exact pin", () => {
    const url = new URL(directionsTo(stop(1)));
    expect(url.searchParams.get("destination")).toBe("40.01,-73");
  });

  it("falls back to the address when a stop has no pin", () => {
    const url = new URL(directionsTo(stop(1, false)));
    expect(url.searchParams.get("destination")).toBe("1 Main St");
  });

  it("routes through the stops in order, ending at the last", () => {
    const url = new URL(directionsForDay([stop(1), stop(2), stop(3)])!);
    expect(url.searchParams.get("waypoints")).toBe("40.01,-73|40.02,-73");
    expect(url.searchParams.get("destination")).toBe("40.03,-73");
    // No origin: the route starts wherever the phone is.
    expect(url.searchParams.has("origin")).toBe(false);
  });

  it("stays within Google's waypoint limit", () => {
    const many = Array.from({ length: 14 }, (_, i) => stop(i + 1));
    const url = new URL(directionsForDay(many)!);
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(MAX_ROUTE_STOPS - 1);
  });

  it("has nothing for an empty day", () => {
    expect(directionsForDay([])).toBeNull();
  });
});
