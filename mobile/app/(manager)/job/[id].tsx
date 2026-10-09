import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/api/client";
import {
  agenda as agendaApi,
  materials as materialsApi,
  tasks as tasksApi,
  type AgendaTask,
  type MaterialOption,
} from "@/api/endpoints";
import type { MaterialUsageInput } from "@contracts/worker";
import { directionsTo } from "@/features/map/directions";
import { PhotoSection } from "@/features/photos/PhotoSection";
import {
  Body,
  Button,
  Card,
  ErrorNotice,
  Field,
  Heading,
  Loading,
  Row,
  Screen,
  StatusBadge,
  Title,
} from "@/ui/components";
import { color, space, type, usd } from "@/ui/theme";

/**
 * One job, for admins and owners. Admins can edit it, finish it, cancel it or
 * end its series — each through the same service as the web, with the same
 * guards (a billed job is locked; finishing an unsubmitted job needs a
 * deliberate confirmation). The owner sees it read-only.
 *
 * The job is read from its day's agenda rather than a per-job endpoint: one
 * source of truth for what each role may see.
 */
export default function ManagerJob() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [task, setTask] = useState<AgendaTask | null>(null);
  const [catalog, setCatalog] = useState<MaterialOption[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await agendaApi.get(day || undefined);
      const found = res.tasks.find((t) => t.id === id) ?? null;
      setTask(found);
      setError(found ? null : "This job isn't on that day any more — it may have been moved or cancelled.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this job.");
    } finally {
      setLoading(false);
    }
  }, [id, day]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({ title: task?.clientName ?? "Job" });
  }, [navigation, task?.clientName]);

  const usage = useMemo<MaterialUsageInput[]>(
    () =>
      Object.entries(quantities)
        .map(([materialId, raw]) => ({ materialId, qty: Number(raw) }))
        .filter((u) => Number.isFinite(u.qty) && u.qty > 0),
    [quantities]
  );

  const run = async (action: () => Promise<unknown>, failure: string, after?: "back") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (after === "back") router.back();
      else await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading job…" />
      </Screen>
    );
  }
  if (!task) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Job not found."} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const closed = task.status === "APPROVED" || task.status === "CANCELLED";
  const alreadyLogged = task.materialsUsed.length > 0;

  const startFinish = async () => {
    if (!alreadyLogged && catalog.length === 0) {
      try {
        setCatalog(await materialsApi.usable());
      } catch {
        // Finishing still works without logging material.
      }
    }
    setFinishing(true);
  };

  const confirmFinish = () => {
    const skipping = task.status !== "SUBMITTED";
    Alert.alert(
      "Finish and bill this job?",
      skipping
        ? "The worker hasn't submitted it. Finishing skips their submit and the review, and creates the customer's bill."
        : "This approves the job and creates the customer's bill.",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Finish job",
          onPress: () =>
            void run(
              () => tasksApi.finish(task.id, alreadyLogged ? [] : usage, skipping),
              "Couldn't finish the job."
            ).then(() => setFinishing(false)),
        },
      ]
    );
  };

  const confirmCancel = () =>
    Alert.alert("Cancel this job?", "Any material already logged goes back into stock.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel job",
        style: "destructive",
        onPress: () => void run(() => tasksApi.cancel(task.id), "Couldn't cancel the job.", "back"),
      },
    ]);

  const confirmEndSeries = () =>
    Alert.alert(
      "End this repeating job here?",
      "Later jobs in the series that haven't started are cancelled.",
      [
        { text: "Keep repeating", style: "cancel" },
        {
          text: "End series",
          style: "destructive",
          onPress: () => void run(() => tasksApi.endSeries(task.id), "Couldn't end the series."),
        },
      ]
    );

  return (
    <Screen>
      <View style={s.head}>
        <Title>{task.clientName}</Title>
        <StatusBadge status={task.status} />
      </View>

      {!!task.flagReason && task.status === "FLAGGED" && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: color.danger }}>
          <Text style={s.flagLabel}>Sent back for rework</Text>
          <Body tone="danger">{task.flagReason}</Body>
        </Card>
      )}

      <Card>
        <Row label="When" value={`${task.timeLabel} – ${task.endLabel}`} />
        <Row label="Service" value={task.serviceName} />
        <Row label="Worker" value={task.workerName} />
        {task.price !== null && <Row label="Price" value={usd(task.price)} />}
        {task.extras.length > 0 && <Row label="Add-ons" value={task.extras.join(", ")} />}
        {task.recurring && <Row label="Repeats" value="Yes — part of a series" />}
        <Row
          label="Address"
          value={
            <Text style={s.link} onPress={() => Linking.openURL(directionsTo({ address: task.poolAddress, lat: null, lng: null }))}>
              {task.poolAddress}
            </Text>
          }
        />
      </Card>

      {!!task.notes && (
        <Card>
          <Heading>Notes</Heading>
          <Body tone="muted">{task.notes}</Body>
        </Card>
      )}

      {alreadyLogged && (
        <Card>
          <Heading>Materials used</Heading>
          {task.materialsUsed.map((m) => (
            <Row key={m.materialId} label={m.name} value={`${m.quantityUsed} ${m.unit}`} />
          ))}
        </Card>
      )}

      {task.bill && (
        <Card>
          <Heading>Bill</Heading>
          <Row label="Total" value={usd(task.bill.amount)} />
          <Row label="Paid" value={usd(task.bill.paid)} />
          <Row label="Balance" value={usd(task.bill.balance)} />
        </Card>
      )}

      <PhotoSection taskId={task.id} editable={isAdmin && !closed} />

      {!!error && <ErrorNotice message={error} />}

      {isAdmin && !closed && finishing && (
        <Card>
          <Heading>Finish job</Heading>
          {alreadyLogged ? (
            <Body tone="muted">Material was logged by the crew and is already counted.</Body>
          ) : (
            <>
              <Body tone="muted">Material used (optional) comes off stock and goes on the bill.</Body>
              <View style={{ marginTop: space.md }}>
                {catalog.map((m) => (
                  <Field
                    key={m.id}
                    label={`${m.name} (${m.unit})`}
                    value={quantities[m.id] ?? ""}
                    onChangeText={(v) => setQuantities((q) => ({ ...q, [m.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    editable={!busy}
                  />
                ))}
              </View>
            </>
          )}
          <Button title="Finish and bill" onPress={confirmFinish} loading={busy} />
          <Button
            title="Not now"
            variant="secondary"
            onPress={() => setFinishing(false)}
            style={{ marginTop: space.sm }}
          />
        </Card>
      )}

      {isAdmin && !closed && !finishing && (
        <View style={{ gap: space.sm }}>
          <Button
            title="Edit or reschedule"
            onPress={() => router.push(`/(manager)/job/form?id=${task.id}&day=${task.dayKey}`)}
          />
          <Button title="Finish job" variant="secondary" onPress={startFinish} disabled={busy} />
          {task.recurring && (
            <Button title="End series here" variant="secondary" onPress={confirmEndSeries} disabled={busy} />
          )}
          <Button title="Cancel job" variant="danger" onPress={confirmCancel} disabled={busy} />
        </View>
      )}

      {closed && (
        <Card>
          <Body tone="muted">
            {task.status === "APPROVED"
              ? "This job is finished and billed, so it's locked."
              : "This job was cancelled."}
          </Body>
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    marginBottom: space.md,
  },
  flagLabel: { ...type.label, color: color.danger, marginBottom: space.xs },
  link: { ...type.bodyStrong, color: color.navy700, textAlign: "right" },
});
