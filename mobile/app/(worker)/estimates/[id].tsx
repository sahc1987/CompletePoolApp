import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  estimates as estimatesApi,
  type EstimateCatalog,
  type EstimateDetail,
} from "@/api/endpoints";
import { addLineItemSchema } from "@contracts/estimates";
import {
  Body,
  Button,
  Card,
  Chip,
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
 * One estimate through its life: build it (lines and taxes) while it's a
 * draft, present it, then have the customer sign or decline in person.
 */
export default function EstimateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [est, setEst] = useState<EstimateDetail | null>(null);
  const [suggestions, setSuggestions] = useState<EstimateCatalog["lineItems"]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const load = useCallback(async () => {
    try {
      setEst(await estimatesApi.get(id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this estimate.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Refresh on focus: returning from the signature screen changes the status.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    estimatesApi
      .catalog()
      .then((c) => setSuggestions(c.lineItems))
      .catch(() => setSuggestions([]));
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: est?.clientName ?? "Estimate" });
  }, [navigation, est?.clientName]);

  // Catalog matches for what's typed, so a field quote uses catalog prices.
  const matches = useMemo(() => {
    const q = description.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [description, suggestions]);

  /** Run a mutation, then reload. Errors stay on screen; nothing navigates. */
  const act = async (run: () => Promise<unknown>, failure: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addLine = async () => {
    const line = { description, quantity, unitPrice };
    const parsed = addLineItemSchema.safeParse({ estimateId: id, ...line });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    const done = await act(() => estimatesApi.addLine(id, line), "Couldn't add the line.");
    if (done) {
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
    }
  };

  const remove = () =>
    Alert.alert("Delete this draft?", "It can't be recovered.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await estimatesApi.remove(id);
            router.back();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't delete it.");
          }
        },
      },
    ]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading estimate…" />
      </Screen>
    );
  }

  if (!est) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Estimate not found."} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.head}>
        <Title>{est.clientName}</Title>
        <StatusBadge status={est.status} />
      </View>
      {!!est.poolAddress && <Body tone="muted">{est.poolAddress}</Body>}

      <Card style={{ marginTop: space.md }}>
        <Heading>Line items</Heading>
        {est.lineItems.length === 0 && <Body tone="faint">No line items yet.</Body>}
        {est.lineItems.map((li) => (
          <View key={li.id} style={s.line}>
            <View style={{ flex: 1 }}>
              <Text style={s.lineName}>{li.description}</Text>
              <Text style={s.lineMeta}>
                {li.quantity} × {usd(li.unitPrice)}
              </Text>
            </View>
            <Text style={s.lineAmount}>{usd(li.amount)}</Text>
            {est.isDraft && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${li.description}`}
                hitSlop={12}
                onPress={() =>
                  act(() => estimatesApi.removeLine(id, li.id), "Couldn't remove the line.")
                }
              >
                <Text style={s.remove}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}

        {est.isDraft && (
          <View style={{ marginTop: space.lg }}>
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Pump repair"
              editable={!busy}
            />
            {matches.length > 0 && (
              <View style={s.chips}>
                {matches.map((m) => (
                  <Chip
                    key={`${m.kind}:${m.name}`}
                    label={`${m.name} · ${usd(m.price)}`}
                    selected={false}
                    onPress={() => {
                      setDescription(m.name);
                      setUnitPrice(String(m.price));
                    }}
                  />
                ))}
              </View>
            )}
            <View style={s.pair}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Qty"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  editable={!busy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Unit price ($)"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                  keyboardType="decimal-pad"
                  editable={!busy}
                />
              </View>
            </View>
            <Button title="Add line" variant="secondary" onPress={addLine} disabled={busy} />
          </View>
        )}
      </Card>

      <Card>
        <Heading>Taxes</Heading>
        {est.taxes.length === 0 && <Body tone="faint">Not taxed.</Body>}
        {est.taxes.map((t) => (
          <View key={t.id} style={s.line}>
            <Text style={[s.lineName, { flex: 1 }]}>
              {t.name} ({t.ratePercent}%)
            </Text>
            <Text style={s.lineAmount}>{usd(t.amount)}</Text>
            {est.isDraft && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${t.name}`}
                hitSlop={12}
                onPress={() =>
                  act(() => estimatesApi.removeTax(id, t.id), "Couldn't remove the tax.")
                }
              >
                <Text style={s.remove}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}
        {est.isDraft && est.availableTaxRates.length > 0 && (
          <View style={[s.chips, { marginTop: space.md }]}>
            {est.availableTaxRates.map((r) => (
              <Chip
                key={r.id}
                label={`+ ${r.name} (${r.rate}%)`}
                selected={false}
                onPress={() =>
                  act(() => estimatesApi.addTax(id, r.id), "Couldn't add the tax.")
                }
              />
            ))}
          </View>
        )}
      </Card>

      <Card>
        <Row label="Subtotal" value={usd(est.subtotal)} />
        <Row label="Tax" value={usd(est.taxTotal)} />
        <Row label="Total" value={<Text style={s.total}>{usd(est.total)}</Text>} />
      </Card>

      {!!error && <ErrorNotice message={error} />}

      {est.isDraft && (
        <>
          <Button
            title="Present to customer"
            onPress={() => act(() => estimatesApi.present(id), "Couldn't present it.")}
            loading={busy}
          />
          <Body tone="faint">Locks the numbers and opens the signature step.</Body>
          <Button
            title="Delete draft"
            variant="secondary"
            onPress={remove}
            style={{ marginTop: space.lg }}
          />
        </>
      )}

      {est.isPresented && (
        <>
          <Button
            title="Customer signs"
            onPress={() => router.push(`/(worker)/estimates/sign/${id}`)}
          />
          <Card style={{ marginTop: space.lg }}>
            <Heading>Or the customer declines</Heading>
            <Field
              label="Reason (optional)"
              value={declineReason}
              onChangeText={setDeclineReason}
              editable={!busy}
            />
            <Button
              title="Customer declined"
              variant="danger"
              onPress={() =>
                act(
                  () => estimatesApi.decline(id, { declineReason }),
                  "Couldn't record the decline."
                )
              }
              loading={busy}
            />
          </Card>
          <Button
            title="Back to draft"
            variant="secondary"
            onPress={() => act(() => estimatesApi.backToDraft(id), "Couldn't reopen it.")}
          />
        </>
      )}

      {est.status === "APPROVED" && (
        <Card>
          <Heading>Signed</Heading>
          <Body tone="muted">
            {est.signedByName}
            {est.signedAt ? ` · ${new Date(est.signedAt).toLocaleDateString("en-US")}` : ""}
          </Body>
          {!!est.signatureData && (
            <Image
              source={{ uri: est.signatureData }}
              style={s.signature}
              resizeMode="contain"
              accessibilityLabel="Customer signature"
            />
          )}
          <Body tone="faint">
            {est.convertedTaskId
              ? "Scheduled — it's on the calendar."
              : "The office has been told it's ready to schedule."}
          </Body>
        </Card>
      )}

      {est.status === "DECLINED" && (
        <Card>
          <Heading>Declined</Heading>
          <Body tone="muted">{est.declineReason || "No reason given."}</Body>
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
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  lineName: { ...type.bodyStrong, color: color.ink },
  lineMeta: { ...type.small, color: color.muted },
  lineAmount: { ...type.bodyStrong, color: color.ink },
  remove: { ...type.bodyStrong, color: color.danger, paddingHorizontal: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  pair: { flexDirection: "row", gap: space.md },
  total: { ...type.title, color: color.navy700 },
  signature: {
    height: 100,
    marginVertical: space.md,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 8,
    backgroundColor: color.white,
  },
});
