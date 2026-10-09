import { useEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/client";
import { materialsAdmin } from "@/api/endpoints";
import { materialFieldsSchema } from "@contracts/materials";
import { Body, Button, Card, Field, Loading, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/**
 * Add a material, or edit one (`?id=`). Stock isn't set here — a new
 * material starts at zero and is restocked from its own screen, so every
 * unit on hand has a logged movement behind it.
 */
export default function MaterialForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("");

  useEffect(() => {
    navigation.setOptions({ title: editing ? "Edit material" : "New material" });
  }, [navigation, editing]);

  useEffect(() => {
    if (!id) return;
    materialsAdmin
      .catalog()
      .then((all) => {
        const m = all.find((x) => x.id === id);
        if (!m) return setError("This material no longer exists.");
        setName(m.name);
        setUnit(m.unit);
        setCostPrice(String(m.costPrice));
        setCustomerPrice(String(m.customerPrice));
        setReorderThreshold(String(m.reorderThreshold));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this material."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }

  const save = async () => {
    if (busy) return;
    const input = { name, unit, costPrice, customerPrice, reorderThreshold };
    const parsed = materialFieldsSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (id) await materialsAdmin.update(id, input);
      else await materialsAdmin.create(input);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the material.");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} editable={!busy} />
        <Field label="Unit" value={unit} onChangeText={setUnit} editable={!busy} placeholder="gallon, bag, unit…" />
        <Field
          label="Our cost (per unit)"
          value={costPrice}
          onChangeText={setCostPrice}
          keyboardType="decimal-pad"
          editable={!busy}
        />
        <Field
          label="Customer price (per unit)"
          value={customerPrice}
          onChangeText={setCustomerPrice}
          keyboardType="decimal-pad"
          editable={!busy}
        />
        <Field
          label="Reorder when stock is at or below"
          value={reorderThreshold}
          onChangeText={setReorderThreshold}
          keyboardType="decimal-pad"
          editable={!busy}
        />
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={editing ? "Save changes" : "Add material"} onPress={save} loading={busy} />
        {!editing && (
          <Body tone="muted">
            {"\n"}It starts with no stock. Restock it from its screen once it's in.
          </Body>
        )}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  error: { ...type.small, color: color.danger, marginBottom: space.md },
});
