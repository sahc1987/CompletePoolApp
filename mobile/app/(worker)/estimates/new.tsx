import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { ApiError } from "@/api/client";
import { estimates as estimatesApi, type EstimateCatalog } from "@/api/endpoints";
import { createEstimateSchema, type CreateEstimateInput } from "@contracts/estimates";
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
} from "@/ui/components";
import { space } from "@/ui/theme";

/**
 * Start a draft for an existing customer, or capture a new one on the spot —
 * a worker meets prospects before an admin has entered them. Line items are
 * added on the next screen.
 */
export default function NewEstimate() {
  const router = useRouter();
  const [clients, setClients] = useState<EstimateCatalog["clients"]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    estimatesApi
      .catalog()
      .then((c) => setClients(c.clients))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Couldn't load customers.")
      )
      .finally(() => setLoading(false));
  }, []);

  // A long customer list is unusable as chips; show matches once they type.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
    return list.slice(0, 20);
  }, [clients, search]);
  const chosen = clients.find((c) => c.id === clientId);

  const create = async () => {
    const input: CreateEstimateInput =
      mode === "existing"
        ? { mode, clientId: clientId ?? undefined, poolId: poolId ?? undefined, notes }
        : { mode, newName, newPhone, newEmail, newAddress, notes };

    const parsed = createEstimateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await estimatesApi.create(input);
      router.replace(`/(worker)/estimates/${res.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the estimate. Try again.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.modes}>
        <Chip label="Existing customer" selected={mode === "existing"} onPress={() => setMode("existing")} />
        <Chip label="New customer" selected={mode === "new"} onPress={() => setMode("new")} />
      </View>

      {mode === "existing" ? (
        <Card>
          <Heading>Customer</Heading>
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Type a name"
            autoCorrect={false}
          />
          <View style={s.chips}>
            {matches.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={clientId === c.id}
                onPress={() => {
                  setClientId(c.id);
                  setPoolId(c.pools[0]?.id ?? null);
                }}
              />
            ))}
            {matches.length === 0 && <Body tone="faint">No customer by that name.</Body>}
          </View>

          {!!chosen && chosen.pools.length > 1 && (
            <>
              <Label>Pool</Label>
              <View style={s.chips}>
                {chosen.pools.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.address}
                    selected={poolId === p.id}
                    onPress={() => setPoolId(p.id)}
                  />
                ))}
              </View>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Heading>New customer</Heading>
          <Field label="Name" value={newName} onChangeText={setNewName} editable={!busy} />
          <Field
            label="Phone"
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
            editable={!busy}
          />
          <Field
            label="Email"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!busy}
          />
          <Field
            label="Pool address"
            value={newAddress}
            onChangeText={setNewAddress}
            editable={!busy}
          />
        </Card>
      )}

      <Card>
        <Field
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          editable={!busy}
        />
      </Card>

      {!!error && <ErrorNotice message={error} />}
      <Button title="Start estimate" onPress={create} loading={busy} />
    </Screen>
  );
}

const s = StyleSheet.create({
  modes: { flexDirection: "row", gap: space.sm, marginBottom: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
});
