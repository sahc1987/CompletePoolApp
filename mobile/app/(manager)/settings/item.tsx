import { useEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/client";
import { settings as settingsApi } from "@/api/endpoints";
import { extraFieldsSchema, serviceFieldsSchema, taxRateFieldsSchema } from "@contracts/settings";
import { Body, Button, Card, Field, Loading, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

type Kind = "service" | "extra" | "tax";

const TITLES: Record<Kind, [string, string]> = {
  service: ["New service", "Edit service"],
  extra: ["New add-on", "Edit add-on"],
  tax: ["New tax rate", "Edit tax rate"],
};

/**
 * One catalog item — a service, an add-on or a tax rate (`?kind=`), new or
 * existing (`&id=`). Services and add-ons can be deleted until a job uses
 * them; a tax rate is switched off instead, from the settings list.
 */
export default function CatalogItem() {
  const { kind, id } = useLocalSearchParams<{ kind: Kind; id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState(""); // base price, price, or rate %
  const [duration, setDuration] = useState("");

  useEffect(() => {
    navigation.setOptions({ title: TITLES[kind]?.[editing ? 1 : 0] ?? "Settings" });
  }, [navigation, kind, editing]);

  useEffect(() => {
    if (!id) return;
    settingsApi
      .get()
      .then((d) => {
        if (kind === "service") {
          const x = d.services.find((r) => r.id === id);
          if (!x) return setError("This service no longer exists.");
          setName(x.name);
          setAmount(String(x.basePrice));
          setDuration(String(x.defaultDurationMin));
        } else if (kind === "extra") {
          const x = d.extras.find((r) => r.id === id);
          if (!x) return setError("This add-on no longer exists.");
          setName(x.name);
          setAmount(String(x.price));
        } else {
          const x = d.taxRates.find((r) => r.id === id);
          if (!x) return setError("This tax rate no longer exists.");
          setName(x.name);
          setAmount(String(x.rate));
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this item."))
      .finally(() => setLoading(false));
  }, [id, kind]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }

  const attempt = async (action: () => Promise<unknown>, failure: string) => {
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

  const save = () => {
    if (busy) return;
    if (kind === "service") {
      const input = { name, basePrice: amount, defaultDurationMin: duration };
      const parsed = serviceFieldsSchema.safeParse(input);
      if (!parsed.success) return setError(parsed.error.errors[0].message);
      void attempt(
        () => (id ? settingsApi.updateService(id, input) : settingsApi.createService(input)),
        "Couldn't save the service."
      );
    } else if (kind === "extra") {
      const input = { name, price: amount };
      const parsed = extraFieldsSchema.safeParse(input);
      if (!parsed.success) return setError(parsed.error.errors[0].message);
      void attempt(
        () => (id ? settingsApi.updateExtra(id, input) : settingsApi.createExtra(input)),
        "Couldn't save the add-on."
      );
    } else {
      const input = { name, rate: amount };
      const parsed = taxRateFieldsSchema.safeParse(input);
      if (!parsed.success) return setError(parsed.error.errors[0].message);
      void attempt(
        () => (id ? settingsApi.updateTaxRate(id, input) : settingsApi.createTaxRate(input)),
        "Couldn't save the tax rate."
      );
    }
  };

  const remove = () =>
    Alert.alert(`Delete ${name}?`, "Only possible while no job has used it.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void attempt(
            () => (kind === "service" ? settingsApi.deleteService(id!) : settingsApi.deleteExtra(id!)),
            "Couldn't delete it."
          ),
      },
    ]);

  const amountLabel =
    kind === "service" ? "Base price ($)" : kind === "extra" ? "Price ($)" : "Rate (%)";

  return (
    <Screen>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} editable={!busy} />
        <Field label={amountLabel} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />
        {kind === "service" && (
          <Field
            label="Usual length (minutes)"
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            editable={!busy}
          />
        )}
        {kind === "service" && editing && (
          <Body tone="muted">Jobs already scheduled keep the price they were booked at.{"\n"}</Body>
        )}
        {kind === "tax" && editing && (
          <Body tone="muted">Estimates already signed keep the rate they were signed at.{"\n"}</Body>
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={editing ? "Save" : "Add"} onPress={save} loading={busy} />
        {editing && kind !== "tax" && (
          <Button
            title="Delete"
            variant="secondary"
            onPress={remove}
            disabled={busy}
            style={{ marginTop: space.sm }}
          />
        )}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  error: { ...type.small, color: color.danger, marginBottom: space.md },
});
