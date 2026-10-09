import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { kpi as kpiApi, type KpiSummary } from "@/api/endpoints";
import { Body, Card, ErrorNotice, Heading, Loading, Screen } from "@/ui/components";
import { color, radius, shadow, space, type, usd } from "@/ui/theme";

const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;

/**
 * The owner's numbers, all computed on the server from approved work:
 * revenue, margin after materials (labor isn't deducted), on-time rate, signed
 * estimates, and who and what drove them. Owner only, as on the web.
 */
export default function KpiScreen() {
  const [data, setData] = useState<KpiSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await kpiApi.get());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the numbers.");
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
        <Loading label="Crunching the numbers…" />
      </Screen>
    );
  }

  const topRevenue = Math.max(1, ...(data?.workers.map((w) => w.revenue) ?? [1]));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={color.navy700} />}>
      {!!error && <ErrorNotice message={error} onRetry={load} />}
      {data && (
        <>
          <View style={s.grid}>
            <Stat label="Revenue" value={usd(data.revenue)} sub={`${data.approvedJobs} approved jobs`} tone={color.navy700} />
            <Stat
              label="Margin"
              value={usd(data.margin)}
              sub={`${Math.round(data.marginPct)}% after materials`}
              tone={color.good}
            />
            <Stat
              label="On time"
              value={`${Math.round(data.onTimePct)}%`}
              sub={`${data.onTimeCount} of ${data.submittedCount} submitted`}
              tone={color.teal700}
            />
            <Stat
              label="Signed estimates"
              value={usd(data.signedEstimateTotal)}
              sub={`${data.signedEstimateCount} signed`}
              tone={color.warn}
            />
          </View>

          <Card>
            <Heading>Materials</Heading>
            <View style={s.pair}>
              <Text style={s.pairLabel}>Billed to customers</Text>
              <Text style={s.pairValue}>{usd(data.materialBilled)}</Text>
            </View>
            <View style={s.pair}>
              <Text style={s.pairLabel}>Cost to us</Text>
              <Text style={s.pairValue}>{usd(data.materialCost)}</Text>
            </View>
            <View style={s.pair}>
              <Text style={s.pairLabel}>Hours of work</Text>
              <Text style={s.pairValue}>{hours(data.totalMinutes)}</Text>
            </View>
          </Card>

          <Card>
            <Heading>By worker</Heading>
            {data.workers.length === 0 && <Body tone="muted">No approved jobs yet.</Body>}
            {data.workers.map((w) => (
              <View key={w.id} style={s.worker}>
                <View style={s.workerTop}>
                  <Text style={s.workerName}>{w.name}</Text>
                  <Text style={s.workerRevenue}>{usd(w.revenue)}</Text>
                </View>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${(w.revenue / topRevenue) * 100}%` }]} />
                </View>
                <Text style={s.workerMeta}>
                  {w.jobs} job{w.jobs === 1 ? "" : "s"} · {hours(w.minutes)}
                </Text>
              </View>
            ))}
          </Card>

          {data.materials.length > 0 && (
            <Card>
              <Heading>Top materials</Heading>
              {data.materials.slice(0, 10).map((m) => (
                <View key={m.materialId} style={s.pair}>
                  <Text style={[s.pairLabel, { flex: 1 }]} numberOfLines={1}>
                    {m.name} · {Math.round(m.qty * 100) / 100} {m.unit}
                  </Text>
                  <Text style={s.pairValue}>{usd(m.billed)}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statSub}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginBottom: space.md },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    ...shadow.card,
  },
  statLabel: { ...type.label, color: color.muted },
  statValue: { ...type.title, marginTop: space.xs, marginBottom: 0 },
  statSub: { ...type.small, color: color.muted, marginTop: 2 },
  pair: { flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: space.sm },
  pairLabel: { ...type.small, color: color.muted },
  pairValue: { ...type.bodyStrong, color: color.ink },
  worker: { paddingVertical: space.sm },
  workerTop: { flexDirection: "row", justifyContent: "space-between" },
  workerName: { ...type.bodyStrong, color: color.ink },
  workerRevenue: { ...type.bodyStrong, color: color.navy700 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.chrome100, marginTop: space.xs, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: color.teal700 },
  workerMeta: { ...type.small, color: color.muted, marginTop: 2 },
});
