import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { Icon, Loading, Screen, type IconName } from "@/ui/components";
import { color, radius, shadow } from "@/ui/theme";

/**
 * The admin and owner side of the app, in the same floating tab bar as the
 * worker's.
 *
 * Admins run the day: schedule, new jobs, review. The owner sees the same
 * schedule and map read-only, as on the web (where the owner can only change
 * team accounts). Clients and billing open from the dashboard tiles rather
 * than the bar, which has no room for them — as do materials, team, settings
 * and KPIs. Each follows the web: clients, materials and settings are
 * admin-only, billing is read-only for the owner, the team is managed by both
 * (by rank), and KPIs are the owner's. Hiding a tab is convenience — every call is authorized on
 * the server regardless.
 */

const icon =
  (name: IconName, active: IconName) =>
  ({ focused, color: tint }: { focused: boolean; color: ColorValue }) => (
    <Icon name={focused ? active : name} size={24} color={tint} />
  );

export default function ManagerLayout() {
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
  if (user.role === "WORKER") return <Redirect href="/(worker)" />;
  const isAdmin = user.role === "ADMIN";

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
        name="schedule"
        options={{ title: "Schedule", tabBarIcon: icon("calendar-outline", "calendar") }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Review",
          // Approving and flagging are admin work; the owner doesn't get the tab.
          href: isAdmin ? undefined : null,
          tabBarIcon: icon("checkmark-done-outline", "checkmark-done"),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: "Map", headerShown: false, tabBarIcon: icon("map-outline", "map") }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: icon("person-outline", "person") }}
      />
      {/* Detail screens push over the tabs rather than appearing in the bar. */}
      <Tabs.Screen name="job/[id]" options={{ href: null, title: "Job" }} />
      <Tabs.Screen name="job/form" options={{ href: null, title: "Job" }} />
      <Tabs.Screen name="review/[id]" options={{ href: null, title: "Review job" }} />
      <Tabs.Screen name="clients/index" options={{ href: null, title: "Clients" }} />
      <Tabs.Screen name="clients/[id]" options={{ href: null, title: "Client" }} />
      <Tabs.Screen name="clients/form" options={{ href: null, title: "Client" }} />
      <Tabs.Screen name="clients/pool" options={{ href: null, title: "Pool" }} />
      <Tabs.Screen name="billing/index" options={{ href: null, title: "Billing" }} />
      <Tabs.Screen name="billing/[id]" options={{ href: null, title: "Bill" }} />
      <Tabs.Screen name="billing/pay" options={{ href: null, title: "Record payment" }} />
      <Tabs.Screen name="materials/index" options={{ href: null, title: "Materials" }} />
      <Tabs.Screen name="materials/[id]" options={{ href: null, title: "Material" }} />
      <Tabs.Screen name="materials/form" options={{ href: null, title: "Material" }} />
      <Tabs.Screen name="team/index" options={{ href: null, title: "Team" }} />
      <Tabs.Screen name="team/[id]" options={{ href: null, title: "Team member" }} />
      <Tabs.Screen name="team/new" options={{ href: null, title: "Add person" }} />
      <Tabs.Screen name="settings/index" options={{ href: null, title: "Settings" }} />
      <Tabs.Screen name="settings/item" options={{ href: null, title: "Settings" }} />
      <Tabs.Screen name="kpi" options={{ href: null, title: "Business numbers" }} />
    </Tabs>
  );
}
