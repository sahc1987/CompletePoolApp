import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import { dayRoute as dayRouteApi, type DayRoute } from "@/api/endpoints";
import { directionsForDay, directionsTo } from "@/features/map/directions";
import { Button, Chip, ErrorNotice, Icon, Loading, StatusBadge } from "@/ui/components";
import { color, radius, shadow, space, type } from "@/ui/theme";

/**
 * A day on a map: numbered pins in visit order, a dashed line through each
 * worker's stops, and the stops listed in a panel underneath. The server says
 * which day is today and what the neighbouring days are, so the phone never
 * works a date out itself.
 *
 * Shared by both sides of the app. A worker sees their own route. Managers
 * see every worker's, one color each, with chips to focus on one worker —
 * which is also when whole-route directions make sense.
 */

// One color per worker, readable under white numbers; order of first stop.
const WORKER_COLORS = ["#1a56db", "#0e7490", "#b45309", "#6d28d9", "#be123c", "#15803d", "#c2410c", "#334155"];

// Long Island, until the day's pins arrive and the map fits to them.
const FALLBACK_REGION = {
  latitude: 40.72,
  longitude: -73.45,
  latitudeDelta: 0.6,
  longitudeDelta: 0.6,
};

const DONE = new Set(["SUBMITTED", "APPROVED"]);

export function DayMapScreen({
  byWorker = false,
  jobHref,
}: {
  /** Managers: color by worker, with a worker filter. */
  byWorker?: boolean;
  /** Where a long-press on a stop opens the job. */
  jobHref: (taskId: string, day: string) => string;
}) {
  const router = useRouter();
  const [workerFilter, setWorkerFilter] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [route, setRoute] = useState<DayRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (day?: string) => {
    setLoading(true);
    try {
      setRoute(await dayRouteApi.get(day));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load your route.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fresh each time the tab is opened — a job may have been finished meanwhile.
  useFocusEffect(
    useCallback(() => {
      void load(route?.day);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const stops = (route?.stops ?? []).filter((s) => !workerFilter || s.workerId === workerFilter);
  const workerIndex = new Map((route?.workers ?? []).map((w, i) => [w.id, i]));
  const colorFor = (workerId: string) =>
    byWorker ? WORKER_COLORS[(workerIndex.get(workerId) ?? 0) % WORKER_COLORS.length]! : color.navy700;
  const placed = stops.filter((s) => s.lat !== null && s.lng !== null);
  const coords = placed.map((s) => ({ latitude: s.lat!, longitude: s.lng! }));

  // Frame every pin whenever the day changes.
  useEffect(() => {
    if (coords.length === 0) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 50, bottom: 60, left: 50 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.day, coords.length]);

  const focus = (taskId: string) => {
    setSelected(taskId);
    const s = placed.find((p) => p.taskId === taskId);
    if (s) {
      mapRef.current?.animateToRegion(
        { latitude: s.lat!, longitude: s.lng!, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        350
      );
    }
  };

  // A whole-day route is one person's: the worker's own, or a filtered worker's.
  const dayDirections = !byWorker || workerFilter ? directionsForDay(stops) : null;

  // One dashed line per worker, through their stops in order.
  const lines = new Map<string, { latitude: number; longitude: number }[]>();
  for (const s of placed) {
    lines.set(s.workerId, [...(lines.get(s.workerId) ?? []), { latitude: s.lat!, longitude: s.lng! }]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={FALLBACK_REGION}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        {[...lines.entries()].map(([workerId, path]) =>
          path.length > 1 ? (
            <Polyline
              key={workerId}
              coordinates={path}
              strokeColor={colorFor(workerId)}
              strokeWidth={3}
              lineDashPattern={[8, 8]}
            />
          ) : null
        )}
        {placed.map((s) => (
          <Marker
            key={s.taskId}
            coordinate={{ latitude: s.lat!, longitude: s.lng! }}
            onPress={() => focus(s.taskId)}
            tracksViewChanges={false}
            accessibilityLabel={`Stop ${s.order}, ${s.clientName}`}
          >
            <View
              style={[
                st.pin,
                { backgroundColor: colorFor(s.workerId) },
                DONE.has(s.status) && st.pinDone,
                selected === s.taskId && st.pinSelected,
              ]}
            >
              <Text style={st.pinText}>{s.order}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Day switcher floats over the map, like the reference's top bar. */}
      <View style={[st.topBar, { top: insets.top + space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          disabled={!route || loading}
          onPress={() => route && load(route.prevDay)}
          style={st.navBtn}
        >
          <Icon name="chevron-back" size={22} color={color.white} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          disabled={!route || loading || route.day === route.today}
          onPress={() => route && load(route.today)}
          style={{ flex: 1, alignItems: "center" }}
        >
          <Text style={st.topTitle}>
            {route ? (route.day === route.today ? "Today" : route.dayLabel) : "Loading…"}
          </Text>
          {route && route.day === route.today && <Text style={st.topSub}>{route.dayLabel}</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          disabled={!route || loading}
          onPress={() => route && load(route.nextDay)}
          style={st.navBtn}
        >
          <Icon name="chevron-forward" size={22} color={color.white} />
        </Pressable>
      </View>

      {/* The stop list, in a rounded sheet over the bottom of the map. */}
      <View style={st.sheet}>
        <View style={st.handle} />
        <View style={st.sheetHead}>
          <Text style={st.sheetTitle}>
            {stops.length} stop{stops.length === 1 ? "" : "s"}
          </Text>
          {loading && <Text style={st.sheetMeta}>Updating…</Text>}
        </View>

        {byWorker && route && route.workers.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Chip label="All" selected={!workerFilter} onPress={() => setWorkerFilter(null)} />
              {route.workers.map((w) => (
                <Chip
                  key={w.id}
                  label={w.name}
                  selected={workerFilter === w.id}
                  onPress={() => setWorkerFilter(w.id)}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {!!error && <ErrorNotice message={error} onRetry={() => load(route?.day)} />}
        {!error && !loading && stops.length === 0 && (
          <Text style={st.empty}>No jobs on this day.</Text>
        )}
        {loading && !route && <Loading />}

        <ScrollView style={{ maxHeight: 230 }} contentContainerStyle={{ paddingBottom: space.sm }}>
          {stops.map((s) => (
            <Pressable
              key={s.taskId}
              onPress={() => (s.lat !== null ? focus(s.taskId) : undefined)}
              onLongPress={() => route && router.push(jobHref(s.taskId, route.day) as never)}
              style={[st.stop, selected === s.taskId && { backgroundColor: color.chrome100 }]}
            >
              <View style={[st.num, { backgroundColor: colorFor(s.workerId) }, DONE.has(s.status) && st.pinDone]}>
                <Text style={st.numText}>{s.order}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.stopName} numberOfLines={1}>
                  {s.clientName}
                </Text>
                <Text style={st.stopMeta} numberOfLines={1}>
                  {s.timeLabel} · {s.serviceName}
                  {byWorker ? ` · ${s.workerName}` : ""}
                </Text>
                <Text style={st.stopAddr} numberOfLines={1}>
                  {s.lat === null ? "Location not found · " : ""}
                  {s.address}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <StatusBadge status={s.status} />
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Navigate to ${s.clientName}`}
                  hitSlop={10}
                  onPress={() => Linking.openURL(directionsTo(s))}
                >
                  <Icon name="navigate-circle" size={30} color={color.teal700} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {dayDirections && (
          <Button
            title={byWorker ? "Directions for this route" : "Directions for my day"}
            onPress={() => Linking.openURL(dayDirections)}
            style={{ marginTop: space.sm }}
          />
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.navy700,
    borderWidth: 3,
    borderColor: color.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  pinDone: { backgroundColor: color.good },
  pinSelected: { backgroundColor: color.teal700, transform: [{ scale: 1.2 }] },
  pinText: { color: color.white, fontWeight: "800", fontSize: 14 },
  topBar: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.teal700,
    borderRadius: radius.xl,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    ...shadow.raised,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  topTitle: { ...type.bodyStrong, color: color.white },
  topSub: { ...type.small, color: "#cdeff4" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.white,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    // Clears the floating tab bar.
    paddingBottom: 104,
    ...shadow.raised,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.line,
    marginBottom: space.md,
  },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: space.sm },
  sheetTitle: { ...type.heading, color: color.ink },
  sheetMeta: { ...type.small, color: color.faint },
  empty: { ...type.body, color: color.muted, paddingVertical: space.lg, textAlign: "center" },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
  },
  num: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.navy700,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: color.white, fontWeight: "800" },
  stopName: { ...type.bodyStrong, color: color.ink },
  stopMeta: { ...type.small, color: color.muted },
  stopAddr: { ...type.small, color: color.faint },
});
