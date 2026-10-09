import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { Loading } from "@/ui/components";
import { Screen } from "@/ui/components";

/**
 * The launch gate: decides where a session belongs.
 *
 * Workers go to their day; admins and owners to the manager side.
 */
export default function Index() {
  const { status, user } = useAuth();

  if (status === "restoring") {
    return (
      <Screen scroll={false}>
        <Loading label="Signing you in…" />
      </Screen>
    );
  }

  if (status === "signedOut") return <Redirect href="/sign-in" />;
  if (user.role === "WORKER") return <Redirect href="/(worker)" />;
  // Admins and owners have their own side of the app.
  return <Redirect href="/(manager)" />;
}
