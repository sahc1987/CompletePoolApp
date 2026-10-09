import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/api/client";
import {
  agenda as agendaApi,
  bills as billsApi,
  materialsAdmin,
  tasks as tasksApi,
  type Agenda,
} from "@/api/endpoints";
import { Avatar, ErrorNotice, Hero, Screen, StatusBadge, Tile } from "@/ui/components";
import { color, radius, shadow, space, type, usd } from "@/ui/theme";

const DONE = new Set(["SUBMITTED", "APPROVED"]);

/**
 * Home for admins and owners: today across the whole team, what's waiting on
 * review, money owed, and a tile per section. The owner's view is read-only, so the
 * admin-only tiles (new job, review) aren't offered.
 */
export default function ManagerHome() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [today, setToday] = useState<Agenda | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [owed, setOwed] = useState<number | null>(null);
  const [requests, setRequests] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [day, queue, open, pending] = await Promise.all([
        agendaApi.get(),
        isAdmin ? tasksApi.reviewQueue() : Promise.resolve(null),
        // Only the totals are used; one row keeps the response small.
        billsApi.list({ status: "open", perPage: 1 }).catch(() => null),
        isAdmin ? materialsAdmin.pendingRequests().catch(() => null) : Promise.resolve(null),
      ]);
      setRequests(pending?.length ?? 0);
      setOwed(open ? open.totals.outstanding : null);
      setToday(day);
      setReviewCount(queue ? queue.tasks.length : null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load today.");
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const jobs = today?.tasks ?? [];
  const done = jobs.filter((t) => DONE.has(t.status)).length;
  const upcoming = jobs.filter((t) => !DONE.has(t.status)).slice(0, 3);
  const firstName = user?.name.split(" ")[0] ?? "";
  const jobHref = (id: string) => `/(manager)/job/${id}?day=${today?.day ?? ""}` as const;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={color.white} />}>
      <Hero
        title={`Hi, ${firstName}`}
        subtitle={today ? `${today.dayLabel} · ${isAdmin ? "Admin" : "Owner"}` : " "}
        right={<Avatar name={user?.name ?? ""} onPress={() => router.push("/(manager)/account")} />}
      >
        <View style={s.stats}>
          <Stat value={jobs.length} label="Jobs today" />
          <View style={s.divider} />
          <Stat value={done} label="Done" />
          {isAdmin && (
            <>
              <View style={s.divider} />
              <Stat value={reviewCount ?? 0} label="To review" alert={(reviewCount ?? 0) > 0} />
            </>
          )}
        </View>
      </Hero>

      {!!error && <ErrorNotice message={error} onRetry={load} />}

      {upcoming.length > 0 && (
        <View style={s.panel}>
          <Text style={s.panelTitle}>Coming up today</Text>
          {upcoming.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              onPress={() => router.push(jobHref(t.id))}
              style={({ pressed }) => [s.upRow, pressed && { opacity: 0.85 }]}
            >
              <Text style={s.upTime}>{t.timeLabel}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.upClient} numberOfLines={1}>
                  {t.clientName}
                </Text>
                <Text style={s.upMeta} numberOfLines={1}>
                  {t.serviceName} · {t.workerName}
                </Text>
              </View>
              <StatusBadge status={t.status} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={s.grid}>
        <Tile
          icon="calendar-outline"
          label="Schedule"
          detail={`${jobs.length} today`}
          tone="jobs"
          onPress={() => router.push("/(manager)/schedule")}
        />
        {isAdmin && (
          <Tile
            icon="add-circle-outline"
            label="New job"
            detail="Assign work"
            tone="estimates"
            onPress={() => router.push("/(manager)/job/form")}
          />
        )}
        {isAdmin && (
          <Tile
            icon="checkmark-done-outline"
            label="Review"
            detail={reviewCount ? `${reviewCount} waiting` : "All caught up"}
            tone="materials"
            onPress={() => router.push("/(manager)/review")}
          />
        )}
        {isAdmin && (
          <Tile
            icon="people-outline"
            label="Clients"
            detail="Contacts & pools"
            tone="clients"
            onPress={() => router.push("/(manager)/clients")}
          />
        )}
        <Tile
          icon="cash-outline"
          label="Billing"
          detail={owed === null ? "Bills & payments" : owed > 0 ? `${usd(owed)} owed` : "Nothing owed"}
          tone="billing"
          onPress={() => router.push("/(manager)/billing")}
        />
        {isAdmin && (
          <Tile
            icon="flask-outline"
            label="Materials"
            detail={requests ? `${requests} request${requests === 1 ? "" : "s"}` : "Stock & requests"}
            tone="materials"
            onPress={() => router.push("/(manager)/materials")}
          />
        )}
        {!isAdmin && (
          <Tile
            icon="stats-chart-outline"
            label="Numbers"
            detail="Revenue & margin"
            tone="kpi"
            onPress={() => router.push("/(manager)/kpi")}
          />
        )}
        <Tile
          icon="people-circle-outline"
          label="Team"
          detail="People & pay"
          tone="team"
          onPress={() => router.push("/(manager)/team")}
        />
        {isAdmin && (
          <Tile
            icon="settings-outline"
            label="Settings"
            detail="Hours & catalog"
            tone="settings"
            onPress={() => router.push("/(manager)/settings")}
          />
        )}
        <Tile
          icon="map-outline"
          label="Map"
          detail="Team routes"
          tone="map"
          onPress={() => router.push("/(manager)/map")}
        />
      </View>
    </Screen>
  );
}

function Stat({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, alert && { color: "#ffe1a8" }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  stats: {
    flexDirection: "row",
    marginTop: space.xl,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.lg,
    paddingVertical: space.md,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { ...type.title, color: color.white },
  statLabel: { ...type.small, color: "#d6e4ff" },
  divider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: space.xs },
  panel: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    ...shadow.card,
  },
  panelTitle: { ...type.label, color: color.teal700, marginBottom: space.sm },
  upRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  upTime: { ...type.bodyStrong, color: color.navy700, width: 74 },
  upClient: { ...type.bodyStrong, color: color.ink },
  upMeta: { ...type.small, color: color.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
