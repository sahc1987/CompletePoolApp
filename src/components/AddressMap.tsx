"use client";

import { useEffect, useState } from "react";

// Geocodes a free-text address with Photon (same keyless service the address
// autocomplete uses) and renders it in an OpenStreetMap embed. No API key, no
// map library — the iframe is doing the tile rendering.
const PHOTON_URL = "https://photon.komoot.io/api/";

type Point = { lat: number; lon: number };

function embedUrl({ lat, lon }: Point) {
  // Small bbox around the point sets the zoom; marker drops the pin.
  const d = 0.0035;
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export default function AddressMap({
  address,
  label = "Job location",
}: {
  address: string;
  label?: string;
}) {
  const [point, setPoint] = useState<Point | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "notfound">("idle");

  useEffect(() => {
    const q = address.trim();
    if (!q) {
      setPoint(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");

    (async () => {
      try {
        const res = await fetch(
          `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=1`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("geocode failed");
        const data = (await res.json()) as {
          features: { geometry: { coordinates: [number, number] } }[];
        };
        if (cancelled) return;

        const coords = data.features?.[0]?.geometry?.coordinates;
        if (!coords) {
          setPoint(null);
          setStatus("notfound");
          return;
        }
        // GeoJSON is [lon, lat].
        setPoint({ lat: coords[1], lon: coords[0] });
        setStatus("idle");
      } catch {
        // Aborted or offline — show the not-found state rather than a broken map.
        if (!cancelled) {
          setPoint(null);
          setStatus("notfound");
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [address]);

  if (!address.trim()) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 bg-surface/60 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            {label}
          </p>
          <p className="truncate text-sm font-medium text-ink">{address}</p>
        </div>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm font-semibold text-navy-700 hover:underline"
        >
          Directions →
        </a>
      </div>

      {point ? (
        <iframe
          key={`${point.lat},${point.lon}`}
          title={`Map of ${address}`}
          src={embedUrl(point)}
          loading="lazy"
          className="block h-56 w-full border-0"
        />
      ) : (
        <div className="grid h-56 place-items-center px-4 text-center text-sm text-muted">
          {status === "loading"
            ? "Locating address…"
            : "Couldn't place this address on the map. The Directions link still works."}
        </div>
      )}
    </div>
  );
}
