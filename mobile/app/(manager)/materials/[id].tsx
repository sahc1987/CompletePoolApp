import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { materialsAdmin, type MaterialRow } from "@/api/endpoints";
import { adjustStockSchema } from "@contracts/materials";
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
} from "@/ui/components";
import { color, radius, space, type, usd } from "@/ui/theme";

/**
 * One material: what's on hand, a stock movement (restock adds; an
 * adjustment can go either way, for a recount or damage), its prices, and
 * retiring it. Stock only ever moves through a logged movement.
 */
export default function MaterialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [material, setMaterial] = useState<MaterialRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<"RESTOCK" | "ADJUSTMENT">("RESTOCK");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      // The catalog is small; one list call beats a detail endpoint nobody else needs.
      const all = await materialsAdmin.catalog();
      const found = all.find((m) => m.id === id) ?? null;
      setMaterial(found);
      setError(found ? null : "This material no longer exists.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this material.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({ title: material?.name ?? "Material" });
  }, [navigation, material?.name]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!material) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Material not found."} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const move = async () => {
    if (busy) return;
    const input = { type: kind, quantity: quantity.trim(), note };
    const parsed = adjustStockSchema.safeParse({ materialId: material.id, ...input });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await materialsAdmin.adjustStock(material.id, input);
      setQuantity("");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update the stock.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = () =>
    Alert.alert(
      material.active ? `Retire ${material.name}?` : `Bring back ${material.name}?`,
      material.active
        ? "It comes off every picker. Jobs that already used it keep their history."
        : "It goes back on the pickers for new work.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: material.active ? "Retire" : "Bring back",
          style: material.active ? "destructive" : "default",
          onPress: async () => {
            setBusy(true);
            try {
              await materialsAdmin.toggle(material.id);
              await load();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Couldn't change it.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );

  return (
    <Screen>
      <View style={[s.onHand, material.low && { backgroundColor: "#fae3e3" }]}>
        <Text style={s.onHandLabel}>On hand</Text>
        <Text style={[s.onHandValue, material.low && { color: color.danger }]}>
          {material.quantityOnHand} {material.unit}
        </Text>
        <Text style={s.onHandSub}>
          {!material.active
            ? "Retired"
            : material.low
              ? `At or below the reorder point (${material.reorderThreshold})`
              : `Reorder at ${material.reorderThreshold}`}
        </Text>
      </View>

      {!!error && <ErrorNotice message={error} />}

      <Card>
        <Heading>Stock movement</Heading>
        <View style={s.chips}>
          <Chip label="Restock (add)" selected={kind === "RESTOCK"} onPress={() => setKind("RESTOCK")} />
          <Chip label="Adjust (+ or −)" selected={kind === "ADJUSTMENT"} onPress={() => setKind("ADJUSTMENT")} />
        </View>
        <Field
          label={kind === "RESTOCK" ? `Quantity received (${material.unit})` : `Change (${material.unit}), e.g. -2`}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numbers-and-punctuation"
          editable={!busy}
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder={kind === "RESTOCK" ? "Supplier, invoice no." : "Recount, spilled…"}
          editable={!busy}
        />
        <Button title={kind === "RESTOCK" ? "Add to stock" : "Save adjustment"} onPress={move} loading={busy} />
      </Card>

      <Card>
        <Heading>Details</Heading>
        <Row label="Unit" value={material.unit} />
        <Row label="Our cost" value={usd(material.costPrice)} />
        <Row label="Customer price" value={usd(material.customerPrice)} />
        <Row label="Reorder at" value={`${material.reorderThreshold} ${material.unit}`} />
        <Button
          title="Edit details"
          variant="secondary"
          onPress={() => router.push(`/(manager)/materials/form?id=${material.id}`)}
          style={{ marginTop: space.md }}
        />
      </Card>

      <Card>
        <Body tone="muted">
          {material.active
            ? "Retiring takes it off the pickers without losing any history."
            : "This material is retired and can't go on new work."}
        </Body>
        <Button
          title={material.active ? "Retire material" : "Bring it back"}
          variant={material.active ? "danger" : "primary"}
          onPress={toggle}
          disabled={busy}
          style={{ marginTop: space.md }}
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  onHand: {
    backgroundColor: "#dff4f7",
    borderRadius: radius.xl,
    padding: space.lg,
    alignItems: "center",
    marginBottom: space.md,
  },
  onHandLabel: { ...type.label, color: color.muted },
  onHandValue: { ...type.display, color: color.teal700, marginTop: space.xs },
  onHandSub: { ...type.small, color: color.muted, marginTop: space.xs, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
});
