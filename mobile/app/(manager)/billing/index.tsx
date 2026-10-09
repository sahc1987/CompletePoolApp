import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  bills as billsApi,
  type Bill,
  type BillListPage,
  type BillStatusFilter,
} from "@/api/endpoints";
import { BillCard } from "@/features/billing/shared";
import { Button, Chip, Empty, ErrorNotice, Loading, Screen } from "@/ui/components";
import { color, radius, shadow, space, type, usd } from "@/ui/theme";

const TABS: { key: BillStatusFilter; label: string }[] = [
  { key: "open", label: "Owed" },
  { key: "all", label: "All" },
  { key: "pending", label: "Unpaid" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
];

/**
 * Every bill, newest first, opening on the ones with money still owed — the
 * list someone collecting payments actually wants. The totals across the top
 * are all-time, as on the web with no date range picked; date ranges stay on
 * the web.
 */
export default function BillingList() {
  const router = useRouter();
  const [tab, setTab] = useState<BillStatusFilter>("open");
  const [data, setData] = useState<BillListPage | null>(null);
  const [rows, setRows] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A slow response for a tab you've already left must not overwrite the new one.
  const latest = useRef(0);

  const load = useCallback(async (status: BillStatusFilter, mode: "initial" | "refresh") => {
    const call = ++latest.current;
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await billsApi.list({ status });
      if (call !== latest.current) return;
      setData(res);
      setRows(res.rows);
      setError(null);
    } catch (e) {
      if (call === latest.current) {
        setError(e instanceof ApiError ? e.message : "Couldn't load bills.");
      }
    } finally {
      if (call === latest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab, "refresh");
    }, [load, tab])
  );

  const loadMore = async () => {
    if (!data || more) return;
    setMore(true);
    try {
      const res = await billsApi.list({ status: tab, page: data.page + 1 });
      setData(res);
      setRows((prev) => [...prev, ...res.rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load more bills.");
    } finally {
      setMore(false);
    }
  };

  const pick = (key: BillStatusFilter) => {
    if (key === tab) return;
    setTab(key);
    setRows([]);
    setLoading(true);
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(tab, "refresh")} tintColor={color.navy700} />
      }
    >
      {data && (
        <View style={s.totals}>
          <Total label="Billed" value={data.totals.billed} tone={color.ink} />
          <View style={s.rule} />
          <Total label="Collected" value={data.totals.collected} tone={color.good} />
          <View style={s.rule} />
          <Total label="Outstanding" value={data.totals.outstanding} tone={color.warn} />
        </View>
      )}

      <View style={s.tabs}>
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={data ? `${t.label} (${data.counts[t.key]})` : t.label}
            selected={tab === t.key}
            onPress={() => pick(t.key)}
          />
        ))}
      </View>

      {!!error && <ErrorNotice message={error} onRetry={() => load(tab, "initial")} />}

      {loading ? (
        <Loading label="Loading bills…" />
      ) : (
        <>
          {!error && rows.length === 0 && (
            <Empty
              title={tab === "open" ? "Nothing owed" : "No bills here"}
              detail="Bills are created automatically when a job is approved."
            />
          )}
          {rows.map((b) => (
            <BillCard
              key={b.id}
              bill={b}
              timezone={data?.timezone}
              onPress={() => router.push(`/(manager)/billing/${b.id}`)}
            />
          ))}
          {data && data.page < data.totalPages && (
            <Button title="Show more" variant="secondary" onPress={loadMore} loading={more} />
          )}
        </>
      )}
    </Screen>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={s.total}>
      <Text style={s.totalLabel}>{label}</Text>
      <Text style={[s.totalValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {usd(value)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  totals: {
    flexDirection: "row",
    backgroundColor: color.white,
    borderRadius: radius.xl,
    paddingVertical: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  total: { flex: 1, alignItems: "center", paddingHorizontal: space.xs },
  totalLabel: { ...type.small, color: color.muted },
  totalValue: { ...type.heading, fontWeight: "700", marginTop: 2 },
  rule: { width: 1, backgroundColor: color.chrome100 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
});
