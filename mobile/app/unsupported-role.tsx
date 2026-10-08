import { Text, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Screen, Title } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/**
 * Where an admin or owner lands until their screens are built.
 *
 * Saying so plainly beats dropping them into a worker's empty task list and
 * letting them conclude the app is broken.
 */
export default function UnsupportedRole() {
  const { status, user, signOut } = useAuth();

  // Signing out from here has to leave the page, or it looks like nothing happened.
  if (status === "signedOut") return <Redirect href="/sign-in" />;

  return (
    <Screen>
      <Title>Not ready for you yet</Title>
      <Card>
        <Text style={s.body}>
          This first release covers the worker&apos;s day — today&apos;s jobs,
          starting and submitting them, and logging what was used.
        </Text>
        <Text style={[s.body, { marginTop: space.md }]}>
          Scheduling, clients, billing and estimates are still web-only.
          Everything you need is at complete-pool-app.vercel.app.
        </Text>
      </Card>

      <Card>
        <Text style={s.meta}>
          Signed in as {user?.name} ({user?.role.toLowerCase()})
        </Text>
        <Button
          title="Sign out"
          variant="secondary"
          onPress={signOut}
          style={{ marginTop: space.md }}
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { ...type.body, color: color.ink, lineHeight: 22 },
  meta: { ...type.small, color: color.muted },
});
