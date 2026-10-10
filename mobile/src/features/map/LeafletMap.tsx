import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { apiBase } from "@/api/client";
import { color } from "@/ui/theme";

/**
 * The day map, drawn by Leaflet on OpenStreetMap tiles inside a WebView — the
 * same map the website uses.
 *
 * This replaced react-native-maps. On Android that library always draws with
 * Google Maps, which needs a Google Cloud API key with billing turned on; Expo
 * Go ships its own key, so the map worked there and then failed in the
 * installed app. OpenStreetMap needs no key on any platform.
 *
 * The page is loaded once. Pins, lines and camera moves are pushed into it with
 * injectJavaScript, and taps on pins come back as postMessage.
 */

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  /** The number on the pin: the stop's place in the day. */
  label: string;
  color: string;
  done: boolean;
  title: string;
};

export type MapLine = { color: string; points: [number, number][] };

export type LeafletMapHandle = {
  /** Fly to one pin and highlight it. */
  focus: (id: string) => void;
};

const FALLBACK_CENTER: [number, number] = [40.72, -73.45]; // Long Island

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";

const html = (fallbackDone: string) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<script src="${LEAFLET}/leaflet.js"></script>
<style>
  html,body,#map{margin:0;height:100%;background:#e8eef5}
  .pin{width:30px;height:30px;border-radius:50%;border:3px solid #fff;color:#fff;
       font:800 14px -apple-system,Roboto,sans-serif;display:flex;align-items:center;
       justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)}
  .pin.sel{transform:scale(1.25)}
</style>
</head><body><div id="map"></div>
<script>
  var send = function (m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  if (!window.L) { send({ type: "error" }); }
  var map = L.map("map", { zoomControl: false, attributionControl: true })
    .setView([${FALLBACK_CENTER[0]}, ${FALLBACK_CENTER[1]}], 10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var markers = {};
  var selected = null;

  function icon(p, sel) {
    var bg = p.done ? "${fallbackDone}" : p.color;
    return L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: '<div class="pin' + (sel ? " sel" : "") + '" style="background:' + bg + '">' + p.label + "</div>"
    });
  }

  window.setData = function (data) {
    layer.clearLayers();
    markers = {};
    data.lines.forEach(function (l) {
      if (l.points.length > 1) {
        L.polyline(l.points, { color: l.color, weight: 3, dashArray: "8 8" }).addTo(layer);
      }
    });
    data.pins.forEach(function (p) {
      var m = L.marker([p.lat, p.lng], { icon: icon(p, p.id === selected), title: p.title }).addTo(layer);
      m.on("click", function () { send({ type: "select", id: p.id }); });
      markers[p.id] = { m: m, p: p };
    });
    if (data.fit && data.pins.length) {
      var b = L.latLngBounds(data.pins.map(function (p) { return [p.lat, p.lng]; }));
      // Room for the floating day bar above and the stop list below.
      map.fitBounds(b, { paddingTopLeft: [40, 90], paddingBottomRight: [40, 60], maxZoom: 15 });
    }
  };

  window.focusPin = function (id) {
    if (selected && markers[selected]) markers[selected].m.setIcon(icon(markers[selected].p, false));
    selected = id;
    var it = markers[id];
    if (!it) return;
    it.m.setIcon(icon(it.p, true));
    map.flyTo([it.p.lat, it.p.lng], 16, { duration: 0.5 });
  };

  send({ type: "ready" });
</script></body></html>`;

export const LeafletMap = forwardRef<
  LeafletMapHandle,
  {
    pins: MapPin[];
    lines: MapLine[];
    /** Changes when the map should re-frame every pin (a new day). */
    fitKey: string;
    onSelect: (id: string) => void;
    onFailed?: () => void;
  }
>(function LeafletMap({ pins, lines, fitKey, onSelect, onFailed }, ref) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const lastFit = useRef<string | null>(null);
  const page = useMemo(() => html(color.good), []);

  const push = () => {
    if (!ready.current) return;
    const fit = lastFit.current !== fitKey;
    lastFit.current = fitKey;
    // JSON is valid JavaScript, so the data is passed as a literal — never
    // spliced into code as strings.
    web.current?.injectJavaScript(`window.setData(${JSON.stringify({ pins, lines, fit })}); true;`);
  };

  useEffect(push);

  useImperativeHandle(ref, () => ({
    focus: (id: string) => web.current?.injectJavaScript(`window.focusPin(${JSON.stringify(id)}); true;`),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; id?: string };
      if (msg.type === "ready") {
        ready.current = true;
        lastFit.current = null;
        push();
      } else if (msg.type === "select" && msg.id) {
        onSelect(msg.id);
      } else if (msg.type === "error") {
        onFailed?.();
      }
    } catch {
      // Not ours; ignore.
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        // The app's own origin as the page origin, so tile requests carry a
        // Referer, as OpenStreetMap's tile policy asks.
        source={{ html: page, baseUrl: apiBase().replace(/\/api\/v1$/, "") }}
        originWhitelist={["*"]}
        onMessage={onMessage}
        onError={() => onFailed?.()}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        style={{ backgroundColor: "#e8eef5" }}
      />
    </View>
  );
});
