import { useEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/client";
import { clients as clientsApi } from "@/api/endpoints";
import { clientFieldsSchema } from "@contracts/clients";
import { Button, Card, ErrorNotice, Field, Loading, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/**
 * New client, or edit one (`?id=`). Checked against the same schema the API
 * validates with, so a bad email is caught before the round trip.
 */
export default function ClientForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    navigation.setOptions({ title: editing ? "Edit client" : "New client" });
  }, [navigation, editing]);

  useEffect(() => {
    if (!id) return;
    clientsApi
      .get(id)
      .then((c) => {
        setName(c.name);
        setPhone(c.phone ?? "");
        setEmail(c.email ?? "");
        setAddress(c.address ?? "");
        setNotes(c.notes ?? "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this client."))
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
    const input = { name, phone, email, address, notes };
    const parsed = clientFieldsSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (id) {
        await clientsApi.update(id, input);
        router.back();
      } else {
        const created = await clientsApi.create(input);
        // Straight to the new client, where the first pool gets added.
        router.replace(`/(manager)/clients/${created.id}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the client.");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} editable={!busy} autoCapitalize="words" />
        <Field label="Phone" value={phone} onChangeText={setPhone} editable={!busy} keyboardType="phone-pad" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="Billing address"
          value={address}
          onChangeText={setAddress}
          editable={!busy}
          placeholder="Where the bill goes"
        />
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          editable={!busy}
          multiline
          style={s.notes}
          placeholder="Gate code, dog, best time to call…"
        />
        {!!error && (editing ? <Text style={s.error}>{error}</Text> : <ErrorNotice message={error} />)}
        <Button title={editing ? "Save changes" : "Add client"} onPress={save} loading={busy} />
        {!editing && (
          <Text style={s.hint}>You'll add their pool on the next screen.</Text>
        )}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  notes: { minHeight: 90, textAlignVertical: "top", paddingTop: space.sm },
  error: { ...type.small, color: color.danger, marginBottom: space.md },
  hint: { ...type.small, color: color.muted, textAlign: "center", marginTop: space.md },
});
