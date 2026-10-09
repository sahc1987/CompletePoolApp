import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { auth as authApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Field, Hero, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

export default function SignIn() {
  const { signIn, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The public read-only demo login, offered while it's switched on server-side.
  const [demo, setDemo] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    authApi
      .demo()
      .then(setDemo)
      .catch(() => setDemo(null));
  }, []);

  const submit = async (creds?: { email: string; password: string }) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn((creds?.email ?? email).trim(), creds?.password ?? password);
      // No navigation here: the auth state changes and the redirect below
      // sends the user to the launch gate, which routes by role.
    } catch (e) {
      // The server deliberately gives one message for a wrong password, an
      // unknown address and a disabled account, so there is nothing to
      // elaborate on — showing it verbatim is the whole story.
      setError(
        e instanceof ApiError
          ? e.message
          : "Couldn't sign in. Try again."
      );
      setBusy(false);
    }
  };

  // Signed in: hand over to the launch gate, which routes by role. The gate is
  // the "/" screen, which was replaced by this one on the way in, so it has to
  // be navigated back to — it can't react to the sign-in from here.
  if (status === "authenticated") return <Redirect href="/" />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <Screen>
        <Hero title="Complete Pool" subtitle="Sign in to see your day." />

        <Card>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          placeholder="you@completepoolservice.com"
          editable={!busy}
          returnKeyType="next"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={() => submit()}
        />

        {!!error && (
          <Text style={s.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        <Button
          title="Sign in"
          onPress={() => submit()}
          loading={busy}
          disabled={!email.trim() || !password}
        />
        </Card>

        {demo && (
          <Card style={s.demo}>
            <Text style={s.demoTitle}>Just looking around?</Text>
            <Text style={s.demoText}>
              Try the read-only demo account. You can see every screen, but nothing can be changed.
            </Text>
            <Button
              title="Explore the demo"
              variant="secondary"
              onPress={() => submit(demo)}
              disabled={busy}
            />
            <View style={s.creds}>
              <Text style={s.credLine} selectable>
                Email: <Text style={s.credValue}>{demo.email}</Text>
              </Text>
              <Text style={s.credLine} selectable>
                Password: <Text style={s.credValue}>{demo.password}</Text>
              </Text>
            </View>
          </Card>
        )}

        <Text style={s.help}>
          Forgot your password? Ask an admin to reset it — they can do that from
          the Team page.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  error: {
    ...type.body,
    color: color.danger,
    marginBottom: space.md,
  },
  demo: { borderWidth: 1, borderColor: color.teal700 },
  demoTitle: { ...type.heading, color: color.ink },
  demoText: { ...type.small, color: color.muted, marginTop: space.xs, marginBottom: space.md },
  creds: { marginTop: space.md, gap: 2 },
  credLine: { ...type.small, color: color.muted },
  credValue: { fontWeight: "700", color: color.ink },
  help: {
    ...type.small,
    color: color.faint,
    marginTop: space.xl,
    lineHeight: 20,
  },
});
