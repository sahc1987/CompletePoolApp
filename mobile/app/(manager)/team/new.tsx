import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { team as teamApi } from "@/api/endpoints";
import type { RoleValue } from "@contracts/enums";
import { createUserSchema } from "@contracts/users";
import { ROLE_LABEL } from "@/features/team/roles";
import { Body, Button, Card, Chip, Field, Label, Loading, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/**
 * Add someone to the team. The roles offered are the ones the server says the
 * caller may grant — never above their own rank.
 */
export default function NewTeamMember() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleValue[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<RoleValue>("WORKER");
  const [password, setPassword] = useState("");

  useEffect(() => {
    teamApi
      .list()
      .then((l) => setRoles(l.grantableRoles))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load roles."));
  }, []);

  if (!roles) {
    return (
      <Screen>
        {error ? <Text style={s.error}>{error}</Text> : <Loading />}
      </Screen>
    );
  }

  const save = async () => {
    if (busy) return;
    const input = { name, email, phone, role, password };
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await teamApi.create(input);
      router.replace(`/(manager)/team/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add this person.");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" editable={!busy} />
        <Field
          label="Email (they sign in with it)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!busy} />
        <Label>Role</Label>
        <View style={s.chips}>
          {roles.map((r) => (
            <Chip key={r} label={ROLE_LABEL[r].label} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </View>
        <Field
          label="First password (8+ characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Body tone="muted">Give it to them yourself; they can change it under Account.</Body>
        <View style={{ height: space.md }} />
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title="Add to team" onPress={save} loading={busy} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  error: { ...type.small, color: color.danger, marginBottom: space.md },
});
