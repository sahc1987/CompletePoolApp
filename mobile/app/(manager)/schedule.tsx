import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/api/client";
import { agenda as agendaApi, type Agenda, type AgendaTask } from "@/api/endpoints";
import { Empty, ErrorNotice, Icon, Loading, Screen, StatusBadge } from "@/ui/components";
import { color, radius, shadow, space, statusTone, type, usd } from "@/ui/theme";

/**
 * The team's schedule: a Monday–Sunday strip (with a job count per day) and
 * the chosen day's jobs. The web's drag-and-drop grid can't run on a phone;
 * here an admin long-presses a job to reschedule it, which goes through the
 * same hours and double-booking checks.
 */
export default function Schedule() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const params = useLocalSearchParams<{ day?: string }>();

  const [data, setData] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The day on screen, kept across visits to a job and back.
  const dayRef = useRef<string | undefined>(params.day);

  const load = useCallback(async (day?: string, mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const res = await agendaApi.get(day);
      setData(res);
      dayRef.current = res.day;
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the schedule.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Back from editing a job, the day is stale.
  useFocusEffect(
    useCallback(() => {
      void load(dayRef.current, "refresh");
    }, [load])
  );

  const open = (t: AgendaTask) => router.push(`/(manager)/job/${t.id}?day=${t.dayKey}`);
  const reschedule = (t: AgendaTask) =>
    router.push(`/(manager)/job/form?id=${t.id}&day=${t.dayKey}`);

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(dayRef.current, "refresh")}
            tintColor={color.navy700}
          />
        }
      >
        {/* Week strip */}
        <View style={s.weekHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            disabled={!data}
            onPress={() => data && load(data.prevWeek)}
            style={s.arrow}
          >
            <Icon name="chevron-back" size={22} color={color.navy700} />
          </Pressable>
          <Text style={s.dayLabel}>{data?.dayLabel ?? " "}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next week"
            disabled={!data}
            onPress={() => data && load(data.nextWeek)}
            style={s.arrow}
          >
            <Icon name="chevron-forward" size={22} color={color.navy700} />
          </Pressable>
        </View>
        <View style={s.week}>
          {(data?.week ?? []).map((d) => {
            const active = d.day === data?.day;
            const isToday = d.day === data?.today;
            return (
              <Pressable
                key={d.day}
                accessibilityRole="button"
                accessibilityLabel={`${d.weekday} ${d.dateNum}, ${d.count} jobs`}
                onPress={() => load(d.day)}
                style={[s.dayChip, active && s.dayChipOn]}
              >
                <Text style={[s.dayWk, active && { color: "#cfe0ff" }]}>{d.weekday}</Text>
                <Text style={[s.dayNum, active && { color: color.white }, isToday && !active && { color: color.teal700 }]}>
                  {d.dateNum}
                </Text>
                <View style={[s.dot, { opacity: d.count ? 1 : 0 }, active && { backgroundColor: color.white }]} />
              </Pressable>
            );
          })}
        </View>
        {data && data.day !== data.today && (
          <Pressable onPress={() => load(data.today)} style={{ alignSelf: "center", marginBottom: space.md }}>
            <Text style={s.todayLink}>Back to today</Text>
          </Pressable>
        )}

        {!!error && <ErrorNotice message={error} onRetry={() => load(dayRef.current)} />}
        {loading && !data && <Loading label="Loading schedule…" />}
        {data && data.tasks.length === 0 && !error && (
          <Empty title="No jobs this day" detail={isAdmin ? "Tap + to schedule one." : undefined} />
        )}

        {data?.tasks.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityHint={isAdmin ? "Long-press to reschedule" : undefined}
            onPress={() => open(t)}
            onLongPress={isAdmin ? () => reschedule(t) : undefined}
            style={({ pressed }) => [
              s.card,
              { borderLeftColor: statusTone[t.status]?.fg ?? color.line },
              pressed && { opacity: 0.88 },
            ]}
          >
            <View style={s.cardTop}>
              <Text style={s.time}>
                {t.timeLabel} – {t.endLabel}
              </Text>
              <StatusBadge status={t.status} />
            </View>
            <Text style={s.client}>{t.clientName}</Text>
            <Text style={s.meta} numberOfLines={1}>
              {t.serviceName}
              {t.recurring ? " · repeats" : ""}
              {t.price !== null ? ` · ${usd(t.price)}` : ""}
            </Text>
            <View style={s.workerLine}>
              <Icon name="person-circle-outline" size={16} color={color.muted} />
              <Text style={s.worker}>{t.workerName}</Text>
            </View>
          </Pressable>
        ))}
      </Screen>

      {isAdmin && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New job"
          onPress={() => router.push(`/(manager)/job/form?day=${data?.day ?? ""}`)}
          style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Icon name="add" size={30} color={color.white} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  weekHead: { flexDirection: "row", alignItems: "center", marginBottom: space.sm },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.white,
    ...shadow.card,
  },
  dayLabel: { ...type.heading, color: color.ink, flex: 1, textAlign: "center" },
  week: { flexDirection: "row", gap: 6, marginBottom: space.md },
  dayChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    ...shadow.card,
  },
  dayChipOn: { backgroundColor: color.navy700 },
  dayWk: { ...type.small, fontSize: 12, color: color.muted },
  dayNum: { ...type.heading, color: color.ink },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.teal700, marginTop: 3 },
  todayLink: { ...type.bodyStrong, color: color.teal700 },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    borderLeftWidth: 5,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { ...type.bodyStrong, color: color.navy700 },
  client: { ...type.heading, color: color.ink, marginTop: space.sm },
  meta: { ...type.small, color: color.muted, marginTop: 2 },
  workerLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm },
  worker: { ...type.small, color: color.ink, fontWeight: "600" },
  fab: {
    position: "absolute",
    right: space.xl,
    bottom: 104,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.teal700,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
});
