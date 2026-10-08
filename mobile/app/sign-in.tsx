import { useState } from "react";
import { Redirect } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Field, Hero, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

export default function SignIn() {
  const { signIn, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
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
          onSubmitEditing={submit}
        />

        {!!error && (
          <Text style={s.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        <Button
          title="Sign in"
          onPress={submit}
          loading={busy}
          disabled={!email.trim() || !password}
        />
        </Card>

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
  help: {
    ...type.small,
    color: color.faint,
    marginTop: space.xl,
    lineHeight: 20,
  },
});
