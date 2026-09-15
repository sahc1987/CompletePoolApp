import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, setSessionExpiredHandler } from "@/api/client";
import { auth as authApi, me as meApi, type SessionUser } from "@/api/endpoints";
import {
  clearSession,
  readCachedUser,
  readSession,
  writeCachedUser,
  writeSession,
} from "@/api/storage";

/**
 * Who is signed in, and the only place that changes.
 *
 * `status` is three-valued on purpose. "Restoring" is not a detail: on launch
 * the app holds a stored token but doesn't yet know whether it still works, and
 * collapsing that into "signed out" would flash the sign-in screen at a worker
 * who is in fact signed in — every single morning.
 */
type AuthState =
  | { status: "restoring"; user: null }
  | { status: "authenticated"; user: SessionUser }
  | { status: "signedOut"; user: null };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "restoring",
    user: null,
  });

  const signOut = useCallback(async () => {
    const session = await readSession();
    // Tell the server first so the refresh token's whole family is revoked;
    // if that call fails we still drop the local copy, because the user asked
    // to be signed out and the token expires on its own regardless.
    if (session) {
      await authApi.logout(session.refreshToken).catch(() => {});
    }
    await clearSession();
    setState({ status: "signedOut", user: null });
  }, []);

  // The client calls this when a refresh fails outright — the stored session is
  // already cleared by then, so this only has to move the UI.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setState({ status: "signedOut", user: null });
    });
  }, []);

  // Launch. Show the cached identity straight away, then confirm it against
  // /me — which also transparently refreshes an aged-out access token.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [stored, cached] = await Promise.all([
        readSession(),
        readCachedUser(),
      ]);

      if (!stored) {
        if (!cancelled) setState({ status: "signedOut", user: null });
        return;
      }

      // Optimistic: the right person, the right tabs, no spinner. A token that
      // turns out to be dead is corrected below within one round trip.
      if (cached && !cancelled) {
        setState({ status: "authenticated", user: cached });
      }

      try {
        const user = await meApi.get();
        await writeCachedUser(user);
        if (!cancelled) setState({ status: "authenticated", user });
      } catch (e) {
        // No signal is not a dead session. The tokens may be perfectly good,
        // and signing out would force a sign-in that cannot succeed offline
        // either — so a cached identity stands until the server contradicts it.
        if (e instanceof ApiError && e.code === "OFFLINE") {
          if (!cached && !cancelled) {
            setState({ status: "signedOut", user: null });
          }
          return;
        }
        await clearSession();
        if (!cancelled) setState({ status: "signedOut", user: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    await writeSession(session);
    await writeCachedUser(session.user);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut }),
    [state, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
