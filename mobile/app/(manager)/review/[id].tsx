import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, StyleSheet, View } from "react-native";
import { ApiError } from "@/api/client";
import { tasks as tasksApi, type ReviewTask } from "@/api/endpoints";
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
import { space, usd } from "@/ui/theme";

/**
 * One submitted job: what was done, what it used, the photos — and the
 * decision. Approving bills it; flagging sends it back to the worker with the
 * reason, which they see on their job.
 */
export default function ReviewJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [task, setTask] = useState<ReviewTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await tasksApi.reviewQueue();
      const found = res.tasks.find((t) => t.id === id) ?? null;
      setTask(found);
      setError(found ? null : "This job is no longer waiting on review.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this job.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: task?.clientName ?? "Review job" });
  }, [navigation, task?.clientName]);

  const decide = async (action: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
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
        <Button title="Back to review" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const materialsTotal = task.materials.reduce((sum, m) => sum + m.quantityUsed * m.customerPrice, 0);
  const extrasTotal = task.extras.reduce((sum, e) => sum + e.price, 0);

  const approve = () =>
    Alert.alert(
      "Approve this job?",
      `It's billed to ${task.clientName} for about ${usd(task.price + extrasTotal + materialsTotal)}.`,
      [
        { text: "Not yet", style: "cancel" },
        { text: "Approve", onPress: () => void decide(() => tasksApi.approve(task.id), "Couldn't approve.") },
      ]
    );

  const flag = () => {
    if (!reason.trim()) {
      setError("Give a reason so the worker knows what to fix.");
      return;
    }
    void decide(() => tasksApi.flag(task.id, reason.trim()), "Couldn't send it back.");
  };

  return (
    <Screen>
      <View style={s.head}>
        <Title>{task.clientName}</Title>
        <StatusBadge status={task.status} />
      </View>

      <Card>
        <Row label="Service" value={task.serviceName} />
        <Row label="Worker" value={task.workerName} />
        <Row label="Address" value={task.poolAddress} />
        <Row label="Price" value={usd(task.price)} />
        {task.extras.map((e) => (
          <Row key={e.id} label={e.name} value={usd(e.price)} />
        ))}
      </Card>

      {task.materials.length > 0 && (
        <Card>
          <Heading>Materials used</Heading>
          {task.materials.map((m) => (
            <Row
              key={m.materialId}
              label={`${m.name} · ${m.quantityUsed} ${m.unit}`}
              value={usd(m.quantityUsed * m.customerPrice)}
            />
          ))}
        </Card>
      )}

      {!!task.notes && (
        <Card>
          <Heading>Notes</Heading>
          <Body tone="muted">{task.notes}</Body>
        </Card>
      )}

      <PhotoSection taskId={task.id} editable={false} />

      {!!error && <ErrorNotice message={error} />}

      <Button title="Approve and bill" onPress={approve} loading={busy} />

      <Card style={{ marginTop: space.lg }}>
        <Heading>Or send it back</Heading>
        <Field
          label="What needs fixing"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Missing the after photo"
          multiline
          editable={!busy}
        />
        <Button title="Flag for rework" variant="danger" onPress={flag} disabled={busy} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: space.md },
});

