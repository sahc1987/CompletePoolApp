import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { Loading } from "@/ui/components";
import { Screen } from "@/ui/components";

/**
 * The launch gate: decides where a session belongs.
 *
 * Only the worker flow exists so far (phase 2). Admin and owner screens land in
 * later phases, so those roles are told plainly to use the web app rather than
 * dropped into an app with nothing in it.
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
  return <Redirect href="/unsupported-role" />;
}
