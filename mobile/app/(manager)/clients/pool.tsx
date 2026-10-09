import { useEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/client";
import { clients as clientsApi, pools as poolsApi } from "@/api/endpoints";
import { poolFieldsSchema } from "@contracts/clients";
import { Button, Card, Field, Loading, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/**
 * Add a pool to a client (`?clientId=`), or edit or delete one (`&poolId=`).
 * Changing the address makes the day map look the pool up again.
 */
export default function PoolForm() {
  const { clientId, poolId } = useLocalSearchParams<{ clientId: string; poolId?: string }>();
  const editing = !!poolId;
  const router = useRouter();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [size, setSize] = useState("");
  const [kind, setKind] = useState("");

  useEffect(() => {
    navigation.setOptions({ title: editing ? "Edit pool" : "Add pool" });
  }, [navigation, editing]);

  useEffect(() => {
    if (!poolId) return;
    clientsApi
      .get(clientId)
      .then((c) => {
        const p = c.pools.find((x) => x.id === poolId);
        if (!p) {
          setError("This pool no longer exists.");
          return;
        }
        setAddress(p.address);
        setSize(p.size ?? "");
        setKind(p.type ?? "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this pool."))
      .finally(() => setLoading(false));
  }, [clientId, poolId]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }

  const save = async () => {
    if (busy) return;
    const input = { address, size, type: kind };
    const parsed = poolFieldsSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (poolId) await poolsApi.update(poolId, input);
      else await clientsApi.addPool(clientId, input);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the pool.");
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert("Delete this pool?", address, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await poolsApi.remove(poolId!);
            router.back();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't delete the pool.");
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <Screen>
      <Card>
        <Field
          label="Service address"
          value={address}
          onChangeText={setAddress}
          editable={!busy}
          placeholder="Where the crew goes"
        />
        <Field
          label="Size (optional)"
          value={size}
          onChangeText={setSize}
          editable={!busy}
          placeholder="e.g. 15,000 gal"
        />
        <Field
          label="Type (optional)"
          value={kind}
          onChangeText={setKind}
          editable={!busy}
          placeholder="e.g. In-ground"
        />

        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={editing ? "Save pool" : "Add pool"} onPress={save} loading={busy} />
        {editing && (
          <Button
            title="Delete pool"
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
