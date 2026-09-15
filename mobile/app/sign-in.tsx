import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button, Field, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

export default function SignIn() {
  const { signIn } = useAuth();
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
      // No navigation here: the auth state changes and the launch gate routes.
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <Screen>
        <View style={s.header}>
          <Text style={s.wordmark}>Complete Pool</Text>
          <Text style={s.tagline}>Sign in to see your day.</Text>
        </View>

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

        <Text style={s.help}>
          Forgot your password? Ask an admin to reset it — they can do that from
          the Team page.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: { marginTop: space.xxl, marginBottom: space.xl },
  wordmark: { ...type.display, color: color.navy900 },
  tagline: { ...type.body, color: color.muted, marginTop: space.xs },
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
