import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, Switch, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  materialRequests as requestsApi,
  materials as materialsApi,
  tasks as tasksApi,
  type MaterialOption,
  type MaterialRequest,
  type WorkerTask,
} from "@/api/endpoints";
import { createMaterialRequestSchema } from "@contracts/worker";
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNotice,
  Field,
  Heading,
  Label,
  Loading,
  Screen,
  StatusBadge,
} from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/** "Something else" — a material that isn't in the catalog yet. */
const OTHER = "__other";

/**
 * Ask the office for material: a catalog item or a free-text description,
 * optionally tied to one of the worker's jobs. Below the form, the worker's
 * recent requests with the admin's answer.
 */
export default function RequestMaterials() {
  const [catalog, setCatalog] = useState<MaterialOption[]>([]);
  const [jobs, setJobs] = useState<WorkerTask[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const [materialId, setMaterialId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mats, mine, list] = await Promise.all([
        materialsApi.usable(),
        requestsApi.mine(),
        tasksApi.mine(),
      ]);
      setCatalog(mats);
      setRequests(mine);
      setJobs(list.tasks);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load materials.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const reset = () => {
    setMaterialId(null);
    setDescription("");
    setQuantity("");
    setTaskId(null);
    setUrgent(false);
  };

  const send = async () => {
    const input = {
      materialId: materialId && materialId !== OTHER ? materialId : undefined,
      description: materialId === OTHER ? description : undefined,
      quantityRequested: quantity,
      taskId: taskId ?? undefined,
      urgent,
    };
    // Same schema the API validates with, so a mistake shows up before the
    // round trip.
    const parsed = createMaterialRequestSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await requestsApi.create(input);
      reset();
      setSent(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading materials…" />
      </Screen>
    );
  }

  const unit = catalog.find((m) => m.id === materialId)?.unit;

  return (
    <Screen>
      <Card>
        <Heading>What do you need?</Heading>
        <View style={s.chips}>
          {catalog.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              selected={materialId === m.id}
              onPress={() => setMaterialId(m.id)}
            />
          ))}
          <Chip
            label="Something else"
            selected={materialId === OTHER}
            onPress={() => setMaterialId(OTHER)}
          />
        </View>

        {materialId === OTHER && (
          <Field
            label="Describe it"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. 2-inch PVC elbow"
            editable={!busy}
          />
        )}

        <Field
          label={unit ? `Quantity (${unit})` : "Quantity"}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          placeholder="0"
          editable={!busy}
        />

        {jobs.length > 0 && (
          <View style={{ marginBottom: space.lg }}>
            <Label>For a job (optional)</Label>
            <View style={s.chips}>
              <Chip label="General restock" selected={!taskId} onPress={() => setTaskId(null)} />
              {jobs.map((j) => (
                <Chip
                  key={j.id}
                  label={j.clientName}
                  selected={taskId === j.id}
                  onPress={() => setTaskId(j.id)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={s.urgent}>
          <View style={{ flex: 1 }}>
            <Text style={s.urgentTitle}>Urgent</Text>
            <Body tone="muted">It&apos;s blocking a job right now.</Body>
          </View>
          <Switch
            value={urgent}
            onValueChange={setUrgent}
            accessibilityLabel="Urgent"
            trackColor={{ true: color.danger, false: color.line }}
          />
        </View>

        {!!error && <ErrorNotice message={error} />}
        {sent && <Body tone="muted">Sent — the office has been notified.</Body>}

        <Button title="Send request" onPress={send} loading={busy} style={{ marginTop: space.md }} />
      </Card>

      <Heading>My requests</Heading>
      {requests.length === 0 && <Body tone="faint">No requests yet.</Body>}
      {requests.map((r) => (
        <Card key={r.id}>
          <View style={s.reqTop}>
            <Text style={s.reqName}>
              {r.materialName ?? r.description} × {r.quantityRequested}
              {r.materialUnit ? ` ${r.materialUnit}` : ""}
            </Text>
            <StatusBadge status={r.status} />
          </View>
          {r.urgent && <Text style={s.urgentTag}>Urgent</Text>}
          {!!r.responseNote && <Body tone="muted">“{r.responseNote}”</Body>}
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.lg,
  },
  urgent: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.md,
  },
  urgentTitle: { ...type.bodyStrong, color: color.ink },
  reqTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.md,
  },
  reqName: { ...type.bodyStrong, color: color.ink, flex: 1 },
  urgentTag: { ...type.small, color: color.danger, fontWeight: "700", marginTop: space.xs },
});
