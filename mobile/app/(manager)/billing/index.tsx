import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  bills as billsApi,
  type BillListPage,
  type BillRange,
  type BillStatusFilter,
} from "@/api/endpoints";
import { BillCard } from "@/features/billing/shared";
import { Button, Chip, Empty, ErrorNotice, Icon, Loading, Screen } from "@/ui/components";
import { DateField } from "@/ui/DateField";
import { color, radius, shadow, space, type, usd } from "@/ui/theme";

const TABS: { key: BillStatusFilter; label: string }[] = [
  { key: "open", label: "Owed" },
  { key: "all", label: "All" },
  { key: "pending", label: "Unpaid" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
];

const RANGES: { key: BillRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "day", label: "Day" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

type Query = { status: BillStatusFilter; range: BillRange; from?: string; to?: string };

/**
 * Every bill, newest first, opening on the ones with money still owed — the
 * list someone collecting payments actually wants.
 *
 * A period scopes it the way the web's does (the server resolves it, in the
 * business's timezone): a bill is in the period if the job was done in it or
 * money came in during it. Billed counts jobs dated in the period, collected
 * counts payments received in it, outstanding is the real balance today.
 */
export default function BillingList() {
  const router = useRouter();
  const [query, setQuery] = useState<Query>({ status: "open", range: "all" });
  const [data, setData] = useState<BillListPage | null>(null);
  const [rows, setRows] = useState<BillListPage["rows"]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Custom-range fields, applied with a button rather than on every keystroke.
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  // A slow response for a filter you've already left must not overwrite the new one.
  const latest = useRef(0);

  const load = useCallback(async (q: Query, mode: "initial" | "refresh") => {
    const call = ++latest.current;
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await billsApi.list(q);
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
      void load(query, "refresh");
    }, [load, query])
  );

  const loadMore = async () => {
    if (!data || more) return;
    setMore(true);
    try {
      const res = await billsApi.list({ ...query, page: data.page + 1 });
      setData(res);
      setRows((prev) => [...prev, ...res.rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load more bills.");
    } finally {
      setMore(false);
    }
  };

  const change = (next: Partial<Query>) => {
    setQuery((q) => ({ ...q, ...next }));
    setRows([]);
    setLoading(true);
  };

  const pickRange = (range: BillRange) => {
    if (range === query.range) return;
    // Custom waits for dates; the rest apply at once.
    if (range === "custom") {
      setFromDraft(query.from ?? "");
      setToDraft(query.to ?? "");
    }
    change({ range, from: undefined, to: undefined });
  };

  const period = data?.period;
  const ranged = query.range !== "all";

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(query, "refresh")} tintColor={color.navy700} />
      }
    >
      <View style={s.tabs}>
        {RANGES.map((r) => (
          <Chip key={r.key} label={r.label} selected={query.range === r.key} onPress={() => pickRange(r.key)} />
        ))}
      </View>

      {query.range === "day" && period && (
        <View style={s.dayRow}>
          <Arrow icon="chevron-back" label="Previous day" onPress={() => change({ from: period.prevDay })} />
          <Text style={s.dayLabel}>{period.label?.replace(/^on /, "") ?? ""}</Text>
          <Arrow icon="chevron-forward" label="Next day" onPress={() => change({ from: period.nextDay })} />
          {period.dayValue !== period.todayValue && (
            <Pressable onPress={() => change({ from: undefined })} hitSlop={8} accessibilityRole="button">
              <Text style={s.today}>Today</Text>
            </Pressable>
          )}
        </View>
      )}

      {query.range === "custom" && (
        <View style={s.custom}>
          <View style={s.customRow}>
            <View style={{ flex: 1 }}>
              <DateField
                label="From"
                value={fromDraft}
                onChange={setFromDraft}
                placeholder="Beginning"
                clearable
                defaultDate={period?.todayValue}
              />
            </View>
            <View style={{ flex: 1 }}>
              <DateField
                label="To"
                value={toDraft}
                onChange={setToDraft}
                placeholder="Today"
                clearable
                defaultDate={period?.todayValue}
              />
            </View>
          </View>
          <Button
            title="Apply"
            variant="secondary"
            onPress={() => change({ from: fromDraft.trim() || undefined, to: toDraft.trim() || undefined })}
          />
        </View>
      )}

      {data && (
        <View style={s.totals}>
          <Total label="Billed" value={data.totals.billed} tone={color.ink} />
          <View style={s.rule} />
          <Total label="Collected" value={data.totals.collected} tone={color.good} />
          <View style={s.rule} />
          <Total label="Outstanding" value={data.totals.outstanding} tone={color.warn} />
        </View>
      )}
      {ranged && period?.label && (
        <Text style={s.periodNote}>
          Jobs done or payments received {period.label}. Outstanding is the full balance still owed on these bills.
        </Text>
      )}

      <View style={s.tabs}>
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={data ? `${t.label} (${data.counts[t.key]})` : t.label}
            selected={query.status === t.key}
            onPress={() => query.status !== t.key && change({ status: t.key })}
          />
        ))}
      </View>

      {!!error && <ErrorNotice message={error} onRetry={() => load(query, "initial")} />}

      {loading ? (
        <Loading label="Loading bills…" />
      ) : (
        <>
          {!error && rows.length === 0 && (
            <Empty
              title={ranged ? "Nothing in this period" : query.status === "open" ? "Nothing owed" : "No bills here"}
              detail="Bills are created automatically when a job is approved."
            />
          )}
          {rows.map((b) => (
            <View key={b.id}>
              <BillCard
                bill={b}
                timezone={data?.timezone}
                onPress={() => router.push(`/(manager)/billing/${b.id}`)}
              />
              {ranged && b.paidInPeriod !== b.paid && (
                <Text style={s.inPeriod}>
                  {b.paidInPeriod > 0 ? `${usd(b.paidInPeriod)} of the payments` : "None of the payments"} came in
                  during this period
                </Text>
              )}
            </View>
          ))}
          {data && data.page < data.totalPages && (
            <Button title="Show more" variant="secondary" onPress={loadMore} loading={more} />
          )}
        </>
      )}
    </Screen>
  );
}

function Arrow({
  icon,
  label,
  onPress,
}: {
  icon: "chevron-back" | "chevron-forward";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.arrow}>
      <Icon name={icon} size={20} color={color.navy700} />
    </Pressable>
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
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  dayLabel: { ...type.bodyStrong, color: color.ink, flex: 1, textAlign: "center" },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.field,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
  },
  today: { ...type.bodyStrong, color: color.teal700 },
  custom: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  customRow: { flexDirection: "row", gap: space.md },
  periodNote: { ...type.small, color: color.muted, marginTop: -space.xs, marginBottom: space.md },
  inPeriod: { ...type.small, color: color.muted, marginTop: -space.sm, marginBottom: space.md, marginLeft: space.sm },
});
