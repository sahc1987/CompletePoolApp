import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { Loading, Screen } from "@/ui/components";
import { color } from "@/ui/theme";

/**
 * The worker's tabs.
 *
 * The role check here is convenience, not security — every request is
 * authorized server-side regardless of which screen made it. What it buys is
 * not rendering a worker's UI to someone whose calls would all be refused.
 */
export default function WorkerLayout() {
  const { status, user } = useAuth();

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
        headerStyle: { backgroundColor: color.navy700 },
        headerTintColor: color.white,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: color.teal700,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: { backgroundColor: color.white, borderTopColor: color.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "My day" }} />
      <Tabs.Screen name="estimates/index" options={{ title: "Estimates" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
      {/* Detail screens push over the tabs rather than appearing in the bar. */}
      <Tabs.Screen name="task/[id]" options={{ href: null, title: "Job" }} />
      <Tabs.Screen name="materials" options={{ href: null, title: "Request materials" }} />
      <Tabs.Screen name="estimates/new" options={{ href: null, title: "New estimate" }} />
      <Tabs.Screen name="estimates/[id]" options={{ href: null, title: "Estimate" }} />
      <Tabs.Screen name="estimates/sign/[id]" options={{ href: null, title: "Client signature" }} />
    </Tabs>
  );
}
