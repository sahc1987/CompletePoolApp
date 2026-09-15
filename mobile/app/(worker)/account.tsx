import { Alert } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Row, Screen, Title } from "@/ui/components";
import { space } from "@/ui/theme";

export default function Account() {
  const { user, signOut } = useAuth();

  const confirmSignOut = () =>
    Alert.alert(
      "Sign out?",
      "You'll need your email and password to get back in.",
      [
        { text: "Stay signed in", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ]
    );

  return (
    <Screen>
      <Title>My account</Title>

      <Card>
        <Row label="Name" value={user?.name ?? "—"} />
        <Row label="Email" value={user?.email ?? "—"} />
        <Row label="Phone" value={user?.phone ?? "Not set"} />
        <Row label="Role" value={user ? user.role.toLowerCase() : "—"} />
      </Card>

      <Button
        title="Sign out"
        variant="secondary"
        onPress={confirmSignOut}
        style={{ marginTop: space.sm }}
      />
    </Screen>
  );
}
