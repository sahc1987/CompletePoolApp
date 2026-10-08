"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteStop } from "@/server/services/routeReads";
import { directionsTo } from "@/lib/directions";

/**
 * The Leaflet map itself. Loaded only in the browser (Leaflet touches
 * `window` at import), via next/dynamic from DayMap.
 *
 * Pins are numbered in visit order and colored per worker; each worker's
 * stops are joined by a line in that order. Pins are drawn as HTML (divIcon)
 * rather than Leaflet's default image marker, whose image paths break under
 * bundlers — and a number is more useful than a generic pin anyway.
 */

function pinIcon(order: number, color: string, faded: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;font:700 13px/1 Inter,system-ui,sans-serif;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);opacity:${faded ? 0.55 : 1}">${order}</div>`,
  });
}

/** Zoom to show every pin whenever the set of pins changes. */
function FitToStops({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const DONE = new Set(["SUBMITTED", "APPROVED"]);

export default function DayMapCanvas({
  stops,
  colorFor,
  selectedId,
  onSelect,
  onOpenJob,
}: {
  /** Only stops that have coordinates. */
  stops: RouteStop[];
  colorFor: (workerId: string) => string;
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  /** Admins only — opens the calendar's edit window for the job. */
  onOpenJob?: (taskId: string) => void;
}) {
  const points = stops.map((s) => [s.lat!, s.lng!] as [number, number]);

  // One line per worker, through their stops in visit order.
  const lines = new Map<string, [number, number][]>();
  for (const s of stops) {
    lines.set(s.workerId, [...(lines.get(s.workerId) ?? []), [s.lat!, s.lng!]]);
  }

  return (
    <MapContainer
      // Long Island until the pins arrive; FitToStops takes over immediately.
      center={points[0] ?? [40.68, -73.45]}
      zoom={11}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToStops points={points} />

      {[...lines.entries()].map(([workerId, path]) =>
        path.length > 1 ? (
          <Polyline
            key={workerId}
            positions={path}
            pathOptions={{ color: colorFor(workerId), weight: 3, opacity: 0.7, dashArray: "6 6" }}
          />
        ) : null
      )}

      {stops.map((s) => (
        <Marker
          key={s.taskId}
          position={[s.lat!, s.lng!]}
          icon={pinIcon(s.order, colorFor(s.workerId), DONE.has(s.status))}
          zIndexOffset={s.taskId === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(s.taskId) }}
        >
          <Popup>
            <div style={{ minWidth: 190 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {s.order}. {s.clientName}
              </div>
              <div style={{ color: "#5b6784" }}>
                {s.timeLabel} · {s.serviceName} · {s.durationMin} min
              </div>
              <div style={{ marginTop: 4 }}>{s.address}</div>
              <div style={{ color: "#5b6784", marginTop: 2 }}>{s.workerName}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <a href={directionsTo(s)} target="_blank" rel="noopener noreferrer">
                  Navigate
                </a>
                {onOpenJob && (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenJob(s.taskId);
                    }}
                  >
                    Open job
                  </a>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
