import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { tasks as tasksApi, type BusinessDay, type ReviewTask } from "@/api/endpoints";
import { Empty, ErrorNotice, Icon, Loading, Screen } from "@/ui/components";
import { color, radius, shadow, space, type, usd } from "@/ui/theme";

/**
 * Jobs the crew submitted, oldest first, waiting on an admin to approve
 * (which bills them) or flag back. Photos are optional to submit, so a job
 * without any is called out here for the reviewer to decide on.
 */
export default function ReviewQueue() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewTask[]>([]);
  const [businessDay, setBusinessDay] = useState<BusinessDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await tasksApi.reviewQueue();
      setItems(res.tasks);
      setBusinessDay(res.businessDay);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the review queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load("refresh");
    }, [load])
  );

  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          timeZone: businessDay?.timezone,
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading review queue…" />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} tintColor={color.navy700} />
      }
    >
      {!!error && <ErrorNotice message={error} onRetry={() => load("initial")} />}
      {!error && items.length === 0 && (
        <Empty title="All caught up" detail="Submitted jobs show up here for approval." />
      )}

      {items.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="button"
          onPress={() => router.push(`/(manager)/review/${t.id}`)}
          style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}
        >
          <View style={s.top}>
            <Text style={s.client} numberOfLines={1}>
              {t.clientName}
            </Text>
            <Text style={s.price}>{usd(t.price)}</Text>
          </View>
          <Text style={s.meta}>
            {t.serviceName} · {t.workerName}
          </Text>
          <Text style={s.meta}>Submitted {when(t.submittedAt)}</Text>
          <View style={s.badges}>
            <View style={[s.badge, { backgroundColor: t.photoCount ? "#dcf0e3" : "#e2e8f0" }]}>
              <Icon name="camera-outline" size={14} color={t.photoCount ? color.good : color.pending} />
              <Text style={[s.badgeText, { color: t.photoCount ? color.good : color.pending }]}>
                {t.photoCount ? `${t.photoCount} photo${t.photoCount === 1 ? "" : "s"}` : "No photos"}
              </Text>
            </View>
            {t.materials.length > 0 && (
              <View style={[s.badge, { backgroundColor: "#fdf0dc" }]}>
                <Icon name="flask-outline" size={14} color={color.warn} />
                <Text style={[s.badgeText, { color: color.warn }]}>
                  {t.materials.length} material{t.materials.length === 1 ? "" : "s"}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  client: { ...type.heading, color: color.ink, flex: 1 },
  price: { ...type.bodyStrong, color: color.navy700 },
  meta: { ...type.small, color: color.muted, marginTop: 2 },
  badges: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
});
