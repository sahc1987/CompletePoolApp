import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  materialsAdmin,
  type MaterialRow,
  type PendingMaterialRequest,
} from "@/api/endpoints";
import { Button, Chip, Empty, ErrorNotice, Icon, Loading, Screen } from "@/ui/components";
import { color, radius, shadow, space, type } from "@/ui/theme";

/**
 * Admin: the crew's material requests waiting on an answer, and the stock
 * catalog. Approving a request doesn't change stock — restocking does, once
 * the material actually arrives — so the two live side by side here.
 */
export default function MaterialsHome() {
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "stock">("requests");
  const [requests, setRequests] = useState<PendingMaterialRequest[]>([]);
  const [stock, setStock] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      const [r, s] = await Promise.all([materialsAdmin.pendingRequests(), materialsAdmin.catalog()]);
      setRequests(r);
      setStock(s);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load materials.");
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

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading materials…" />
      </Screen>
    );
  }

  const low = stock.filter((m) => m.low).length;
  // Low stock first, then A–Z; retired at the bottom.
  const sorted = [...stock].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) || Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)
  );

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} tintColor={color.navy700} />
      }
    >
      <View style={s.tabs}>
        <Chip
          label={`Requests (${requests.length})`}
          selected={tab === "requests"}
          onPress={() => setTab("requests")}
        />
        <Chip
          label={low ? `Stock · ${low} low` : "Stock"}
          selected={tab === "stock"}
          onPress={() => setTab("stock")}
        />
      </View>

      {!!error && <ErrorNotice message={error} onRetry={() => load("initial")} />}

      {tab === "requests" ? (
        <>
          {requests.length === 0 && (
            <Empty title="No requests waiting" detail="When the crew asks for materials, it shows up here." />
          )}
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onDone={() => load("refresh")} />
          ))}
        </>
      ) : (
        <>
          <Button
            title="Add material"
            variant="secondary"
            onPress={() => router.push("/(manager)/materials/form")}
            style={{ marginBottom: space.md }}
          />
          {sorted.length === 0 && <Empty title="No materials yet" />}
          {sorted.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(manager)/materials/${m.id}`)}
              style={({ pressed }) => [s.card, !m.active && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{m.name}</Text>
                <Text style={s.meta}>
                  {m.active ? `Reorder at ${m.reorderThreshold} ${m.unit}` : "Retired"}
                </Text>
                {m.low && (
                  <View style={[s.lowBadge, { marginTop: space.xs }]}>
                    <Text style={s.lowText}>Low stock</Text>
                  </View>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.qty, m.low && { color: color.danger }]}>{m.quantityOnHand}</Text>
                <Text style={s.meta}>{m.unit}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

function RequestCard({ request: r, onDone }: { request: PendingMaterialRequest; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"APPROVED" | "DENIED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "APPROVED" | "DENIED") => {
    if (busy) return;
    setBusy(decision);
    setError(null);
    try {
      await materialsAdmin.respond(r.id, { decision, note });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't answer this request.");
      setBusy(null);
    }
  };

  const what = r.materialName ?? r.description ?? "Material";
  const unit = r.materialUnit ? ` ${r.materialUnit}` : "";

  return (
    <View style={s.card2}>
      <View style={s.reqTop}>
        <Text style={s.name} numberOfLines={2}>
          {what}
        </Text>
        {r.urgent && (
          <View style={s.lowBadge}>
            <Text style={s.lowText}>Urgent</Text>
          </View>
        )}
      </View>
      <Text style={s.meta}>
        {r.quantityRequested}
        {unit} · {r.workerName ?? "A worker"}
        {r.taskClientName ? ` · for ${r.taskClientName}` : ""}
      </Text>
      {!r.materialId && <Text style={s.meta}>Not in the catalog yet</Text>}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note to the worker (optional)"
        placeholderTextColor={color.faint}
        style={s.note}
        editable={!busy}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
      <View style={s.actions}>
        <Button
          title="Deny"
          variant="secondary"
          onPress={() => decide("DENIED")}
          loading={busy === "DENIED"}
          disabled={!!busy}
          style={{ flex: 1 }}
        />
        <Button
          title="Approve"
          onPress={() => decide("APPROVED")}
          loading={busy === "APPROVED"}
          disabled={!!busy}
          style={{ flex: 1 }}
        />
      </View>
      <View style={s.hint}>
        <Icon name="information-circle-outline" size={14} color={color.faint} />
        <Text style={s.hintText}>Approving doesn't add stock. Restock when it arrives.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
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
  card2: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  name: { ...type.heading, color: color.ink, flexShrink: 1 },
  meta: { ...type.small, color: color.muted, marginTop: 2 },
  qty: { ...type.title, color: color.ink, marginBottom: 0 },
  lowBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fae3e3",
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  lowText: { fontSize: 11, fontWeight: "700", color: color.danger },
  reqTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  note: {
    marginTop: space.md,
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.field,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    ...type.body,
    color: color.ink,
  },
  error: { ...type.small, color: color.danger, marginTop: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  hint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: space.sm },
  hintText: { fontSize: 12, color: color.faint },
});
