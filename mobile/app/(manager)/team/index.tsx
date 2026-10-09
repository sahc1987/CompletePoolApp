import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { team as teamApi, type TeamList } from "@/api/endpoints";
import { ROLE_LABEL } from "@/features/team/roles";
import { Button, ErrorNotice, Icon, Loading, Screen } from "@/ui/components";
import { color, radius, shadow, space, type } from "@/ui/theme";

/**
 * Everyone with an account, active first. Admins and owners both manage the
 * team — the one place the owner isn't read-only — but only accounts they
 * outrank; the server marks each row with what the caller may do.
 */
export default function TeamScreen() {
  const router = useRouter();
  const [data, setData] = useState<TeamList | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await teamApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the team.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!data && !error) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading team…" />
      </Screen>
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={color.navy700} />}>
      {!!error && <ErrorNotice message={error} onRetry={load} />}
      {data && (
        <>
          <View style={s.head}>
            <Text style={s.count}>
              {data.activeCount} active · {data.members.length} total
            </Text>
            {data.grantableRoles.length > 0 && (
              <Button
                title="Add person"
                variant="secondary"
                onPress={() => router.push("/(manager)/team/new")}
                style={{ minHeight: 40 }}
              />
            )}
          </View>
          {data.members.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(manager)/team/${m.id}`)}
              style={({ pressed }) => [s.card, !m.active && { opacity: 0.55 }, pressed && { opacity: 0.85 }]}
            >
              <View style={[s.dot, { backgroundColor: ROLE_LABEL[m.role].bg }]}>
                <Text style={[s.dotText, { color: ROLE_LABEL[m.role].fg }]}>
                  {m.name.trim()[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {m.name}
                  {m.isSelf ? " (you)" : ""}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  {ROLE_LABEL[m.role].label}
                  {m.active ? "" : " · Disabled"}
                  {m.role === "WORKER" ? ` · ${m.assignedTaskCount} jobs` : ""}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={color.faint} />
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  count: { ...type.small, color: color.muted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  dotText: { ...type.heading, fontWeight: "700" },
  name: { ...type.heading, color: color.ink },
  meta: { ...type.small, color: color.muted, marginTop: 2 },
});
