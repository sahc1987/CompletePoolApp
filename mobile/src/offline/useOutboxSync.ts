import { useEffect } from "react";
import { AppState } from "react-native";
import { flush } from "./outbox";

/**
 * Retry the outbox while the worker is signed in: on launch, whenever the app
 * comes back to the foreground, and every 30 seconds.
 *
 * Polling is the lazy answer to "when is there signal again?". It costs one
 * small file read when the outbox is empty. A network-status listener would
 * react sooner but needs a native module (a new APK) — add it if 30 seconds
 * proves too slow.
 */
export function useOutboxSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => void flush().catch(() => {});
    tick();
    const timer = setInterval(tick, 30_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled]);
}
