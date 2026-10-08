import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { labelForDay, useTasks } from "@/api/useTasks";
import {
  Avatar,
  ErrorNotice,
  Hero,
  Icon,
  Screen,
  StatusBadge,
  Tile,
} from "@/ui/components";
import { color, radius, shadow, space, type } from "@/ui/theme";

/**
 * Home: who's signed in, what today looks like, and a tile for each part of
 * the app. The day itself ("Thursday, Oct 8") comes from the server's
 * business day, never the phone's clock.
 */
export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { groups, businessDay, refreshing, error, retryable, reload, refresh } = useTasks();

  // Back from a job, the counts may have changed.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const today = groups.find((g) => g.key === "today")?.tasks ?? [];
  const rework = groups.find((g) => g.key === "rework")?.tasks ?? [];
  const remaining = today.filter((t) => t.status === "SCHEDULED" || t.status === "IN_PROGRESS");
  const next = remaining[0] ?? null;
  const firstName = user?.name.split(" ")[0] ?? "";

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      timeZone: businessDay?.timezone,
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.white} />
      }
    >
      <Hero
        title={`Hi, ${firstName}`}
        subtitle={businessDay ? labelForDay(businessDay.today) : " "}
        right={
          <Avatar name={user?.name ?? ""} onPress={() => router.push("/(worker)/account")} />
        }
      >
        <View style={s.stats}>
          <Stat value={today.length} label="Jobs today" />
          <View style={s.statDivider} />
          <Stat value={remaining.length} label="To do" />
          <View style={s.statDivider} />
          <Stat value={rework.length} label="Rework" alert={rework.length > 0} />
        </View>
      </Hero>

      {!!error && <ErrorNotice message={error} onRetry={retryable ? reload : undefined} />}

      {next && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next job: ${next.clientName} at ${timeOf(next.startTime)}`}
          onPress={() => router.push(`/(worker)/task/${next.id}`)}
          style={({ pressed }) => [s.next, pressed && { opacity: 0.9 }]}
        >
          <View style={s.nextIcon}>
            <Icon name="navigate" size={22} color={color.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nextLabel}>NEXT JOB · {timeOf(next.startTime)}</Text>
            <Text style={s.nextClient} numberOfLines={1}>
              {next.clientName}
            </Text>
            <Text style={s.nextAddress} numberOfLines={1}>
              {next.poolAddress}
            </Text>
          </View>
          <StatusBadge status={next.status} />
        </Pressable>
      )}

      <View style={s.grid}>
        <Tile
          icon="clipboard-outline"
          label="My jobs"
          detail={today.length ? `${today.length} today` : "Your schedule"}
          tone="jobs"
          onPress={() => router.push("/(worker)/jobs")}
        />
        <Tile
          icon="map-outline"
          label="Map"
          detail="Today's route"
          tone="map"
          onPress={() => router.push("/(worker)/map")}
        />
        <Tile
          icon="document-text-outline"
          label="Estimates"
          detail="Quote & sign"
          tone="estimates"
          onPress={() => router.push("/(worker)/estimates")}
        />
        <Tile
          icon="flask-outline"
          label="Materials"
          detail="Request stock"
          tone="materials"
          onPress={() => router.push("/(worker)/materials")}
        />
      </View>
    </Screen>
  );
}

function Stat({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, alert && { color: "#ffd5d5" }]}>{value}</Text>
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
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: space.xs },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    ...shadow.raised,
  },
  nextIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.teal700,
    alignItems: "center",
    justifyContent: "center",
  },
  nextLabel: { ...type.label, color: color.teal700 },
  nextClient: { ...type.heading, color: color.ink, marginTop: 2 },
  nextAddress: { ...type.small, color: color.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
