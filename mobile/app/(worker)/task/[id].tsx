import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  materials as materialsApi,
  tasks as tasksApi,
  type BusinessDay,
  type MaterialOption,
  type WorkerTask,
} from "@/api/endpoints";
import { submitTaskSchema, type MaterialUsageInput } from "@contracts/worker";
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
import { color, space, type } from "@/ui/theme";

/**
 * One job: what it is, where, and the two things a worker does to it — start
 * it, then submit it with whatever material was used.
 *
 * The task is read out of the worker's own list rather than from a per-task
 * endpoint. That list is short (active jobs only), the server already scopes it
 * to this worker, and it keeps one source of truth for what a worker may see.
 */
export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [task, setTask] = useState<WorkerTask | null>(null);
  const [businessDay, setBusinessDay] = useState<BusinessDay | null>(null);
  const [catalog, setCatalog] = useState<MaterialOption[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, mats] = await Promise.all([
        tasksApi.mine(),
        materialsApi.usable(),
      ]);
      const found = list.tasks.find((t) => t.id === id) ?? null;
      setTask(found);
      setBusinessDay(list.businessDay);
      setCatalog(mats);
      setError(
        found
          ? null
          : "This job is no longer on your list. It may have been approved or reassigned."
      );
      setRetryable(false);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError(err?.message ?? "Couldn't load this job.");
      setRetryable(err?.retryable ?? true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: task?.clientName ?? "Job" });
  }, [navigation, task?.clientName]);

  /**
   * Only positive quantities count. The form lists the whole catalog and most
   * boxes come back empty on every job — a blank box is "not used", which is
   * not the same as a zero and must not be sent as one.
   */
  const usage = useMemo<MaterialUsageInput[]>(
    () =>
      Object.entries(quantities)
        .map(([materialId, raw]) => ({ materialId, qty: Number(raw) }))
        .filter((u) => Number.isFinite(u.qty) && u.qty > 0),
    [quantities]
  );

  const act = async (run: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      // Back to the list, which refreshes on focus and will show the new state.
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
      setBusy(false);
    }
  };

  const start = () =>
    act(
      () => tasksApi.start(task!.id),
      "Couldn't start this job. Try again."
    );

  const submit = () => {
    // Checked against the same schema the API validates with — the contracts
    // directory is shared, not duplicated. Worth doing on the device because a
    // worker on one bar of signal finds out immediately, rather than after a
    // round trip that may not complete.
    const parsed = submitTaskSchema.safeParse({ taskId: task!.id, usage });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    const summary = usage.length
      ? `${usage.length} material${usage.length === 1 ? "" : "s"} logged.`
      : "No materials logged.";
    Alert.alert(
      "Submit this job?",
      `${summary} It goes to an admin for review, and stock is counted now.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Submit",
          onPress: () =>
            void act(
              () => tasksApi.submit(task!.id, usage),
              "Couldn't submit this job. Your entries are still here — try again."
            ),
        },
      ]
    );
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
        <ErrorNotice
          message={error ?? "Job not found."}
          onRetry={retryable ? load : undefined}
        />
        <Button title="Back to my day" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const canStart = task.status === "SCHEDULED" || task.status === "FLAGGED";
  const canSubmit = task.status === "IN_PROGRESS";

  return (
    <Screen>
      <View style={s.head}>
        <Title>{task.clientName}</Title>
        <StatusBadge status={task.status} />
      </View>

      {!!task.flagReason && (
        <Card style={{ borderColor: color.danger, borderWidth: 1 }}>
          <Text style={s.flagLabel}>Sent back for rework</Text>
          <Body tone="danger">{task.flagReason}</Body>
        </Card>
      )}

      <Card>
        <Row label="Service" value={task.serviceName} />
        <Row
          label="Starts"
          value={new Date(task.startTime).toLocaleTimeString("en-US", {
            timeZone: businessDay?.timezone,
            hour: "numeric",
            minute: "2-digit",
          })}
        />
        <Row label="Expected" value={`${task.durationMin} min`} />
        <Row label="Address" value={task.poolAddress} />
        {!!task.clientPhone && (
          <Row
            label="Phone"
            value={
              <Text
                style={s.link}
                accessibilityRole="link"
                onPress={() => Linking.openURL(`tel:${task.clientPhone}`)}
              >
                {task.clientPhone}
              </Text>
            }
          />
        )}
      </Card>

      {!!task.notes && (
        <Card>
          <Heading>Notes</Heading>
          <Body tone="muted">{task.notes}</Body>
        </Card>
      )}

      {canSubmit && (
        <Card>
          <Heading>Materials used</Heading>
          <Body tone="muted">
            Leave a box empty for anything you didn&apos;t use. Stock comes off
            when you submit.
          </Body>
          <View style={{ marginTop: space.lg }}>
            {catalog.length === 0 && <Body tone="faint">No materials in the catalog.</Body>}
            {catalog.map((m) => (
              <Field
                key={m.id}
                label={`${m.name} (${m.unit})`}
                value={quantities[m.id] ?? ""}
                onChangeText={(v) =>
                  setQuantities((q) => ({ ...q, [m.id]: v }))
                }
                keyboardType="decimal-pad"
                placeholder="0"
                editable={!busy}
              />
            ))}
          </View>
        </Card>
      )}

      {!!error && <ErrorNotice message={error} />}

      {canStart && (
        <Button title="Start this job" onPress={start} loading={busy} />
      )}
      {canSubmit && (
        <Button title="Submit for review" onPress={submit} loading={busy} />
      )}
      {task.status === "SUBMITTED" && (
        <Card>
          <Body tone="muted">
            Submitted — waiting on an admin to review it. Nothing more to do
            here.
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
  link: { ...type.bodyStrong, color: color.navy700 },
});
