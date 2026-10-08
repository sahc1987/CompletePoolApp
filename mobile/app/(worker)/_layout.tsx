import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { Icon, Loading, Screen, type IconName } from "@/ui/components";
import { color, radius, shadow } from "@/ui/theme";

/**
 * The worker's tabs, in a floating rounded bar.
 *
 * The role check here is convenience, not security — every request is
 * authorized server-side regardless of which screen made it. What it buys is
 * not rendering a worker's UI to someone whose calls would all be refused.
 */

const icon =
  (name: IconName, active: IconName) =>
  ({ focused, color: tint }: { focused: boolean; color: ColorValue }) => (
    <Icon name={focused ? active : name} size={24} color={tint} />
  );

export default function WorkerLayout() {
  const { status, user } = useAuth();
  const insets = useSafeAreaInsets();

  if (status === "restoring") {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  if (user.role !== "WORKER") return <Redirect href="/unsupported-role" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.navy900 },
        headerTintColor: color.white,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        tabBarActiveTintColor: color.teal700,
        tabBarInactiveTintColor: color.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        // Floats above the content with rounded ends, like the reference.
        tabBarStyle: {
          position: "absolute",
          marginHorizontal: 14,
          bottom: insets.bottom > 0 ? insets.bottom : 12,
          height: 68,
          paddingTop: 8,
          paddingBottom: 10,
          borderRadius: radius.xl,
          borderTopWidth: 0,
          backgroundColor: color.white,
          ...shadow.raised,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", headerShown: false, tabBarIcon: icon("home-outline", "home") }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ title: "My jobs", tabBarIcon: icon("clipboard-outline", "clipboard") }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: "Map", headerShown: false, tabBarIcon: icon("map-outline", "map") }}
      />
      <Tabs.Screen
        name="estimates/index"
        options={{
          title: "Estimates",
          tabBarIcon: icon("document-text-outline", "document-text"),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: icon("person-outline", "person") }}
      />
      {/* Detail screens push over the tabs rather than appearing in the bar. */}
      <Tabs.Screen name="task/[id]" options={{ href: null, title: "Job" }} />
      <Tabs.Screen name="materials" options={{ href: null, title: "Request materials" }} />
      <Tabs.Screen name="estimates/new" options={{ href: null, title: "New estimate" }} />
      <Tabs.Screen name="estimates/[id]" options={{ href: null, title: "Estimate" }} />
      <Tabs.Screen name="estimates/sign/[id]" options={{ href: null, title: "Client signature" }} />
    </Tabs>
  );
}
