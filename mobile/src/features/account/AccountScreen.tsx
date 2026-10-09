import { Alert, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Avatar, Button, Card, Icon, Row, Screen, type IconName } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/** Profile and sign-out, shared by every role. */
export function AccountScreen() {
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
      <View style={s.profile}>
        <View style={s.avatarWrap}>
          <Avatar name={user?.name ?? ""} />
        </View>
        <Text style={s.name}>{user?.name ?? "—"}</Text>
        <Text style={s.role}>{user ? user.role.toLowerCase() : ""}</Text>
      </View>

      <Card>
        <Line icon="mail-outline" label="Email" value={user?.email ?? "—"} />
        <Line icon="call-outline" label="Phone" value={user?.phone ?? "Not set"} />
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

function Line({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <Row
      label={label}
      value={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={icon} size={16} color={color.muted} />
          <Text style={s.value}>{value}</Text>
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  profile: { alignItems: "center", marginVertical: space.lg },
  // The header avatar is white-on-blue; here it sits on navy to match.
  avatarWrap: { backgroundColor: color.navy700, borderRadius: 30, padding: 4, marginBottom: space.md },
  name: { ...type.title, color: color.ink },
  role: { ...type.small, color: color.muted, textTransform: "capitalize" },
  value: { ...type.bodyStrong, color: color.ink },
});
