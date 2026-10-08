import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { estimates as estimatesApi, type EstimateListRow } from "@/api/endpoints";
import {
  Button,
  Empty,
  ErrorNotice,
  Loading,
  Screen,
  StatusBadge,
} from "@/ui/components";
import { color, radius, space, type, usd } from "@/ui/theme";

/**
 * Every estimate, newest first — the same list the web shows staff. A worker
 * builds a quote on site, presents it, and captures the signature here.
 */
export default function Estimates() {
  const router = useRouter();
  const [rows, setRows] = useState<EstimateListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      setRows(await estimatesApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load estimates.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Coming back from an estimate that was just signed, the list is stale.
  useFocusEffect(
    useCallback(() => {
      void load("refresh");
    }, [load])
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading estimates…" />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load("refresh")}
          tintColor={color.navy700}
        />
      }
    >
      <Button
        title="New estimate"
        onPress={() => router.push("/(worker)/estimates/new")}
        style={{ marginBottom: space.lg }}
      />

      {!!error && <ErrorNotice message={error} onRetry={() => load("initial")} />}

      {!error && rows.length === 0 && (
        <Empty
          title="No estimates yet"
          detail="Start one when a customer asks for a quote."
        />
      )}

      {rows.map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityLabel={`Estimate for ${e.clientName}, ${usd(e.total)}`}
          onPress={() => router.push(`/(worker)/estimates/${e.id}`)}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
        >
          <View style={s.top}>
            <Text style={s.client}>{e.clientName}</Text>
            <StatusBadge status={e.status} />
          </View>
          <Text style={s.total}>{usd(e.total)}</Text>
          <Text style={s.meta}>By {e.createdByName}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.lg,
    marginBottom: space.md,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.md,
  },
  client: { ...type.heading, color: color.ink, flex: 1 },
  total: { ...type.title, color: color.navy700, marginTop: space.xs },
  meta: { ...type.small, color: color.faint, marginTop: space.xs },
});
