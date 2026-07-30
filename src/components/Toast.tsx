"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./icons";
import type { ActionState } from "@/lib/actions";

type Variant = "success" | "error";
type Toast = { id: number; message: string; variant: Variant };

export type PushToast = (message: string, variant?: Variant) => void;

const ToastContext = createContext<PushToast | null>(null);

// Stable no-op so `useToast()` is safe to call from a component rendered
// outside the provider without changing identity between renders.
const NOOP: PushToast = () => {};

export function useToast(): PushToast {
  return useContext(ToastContext) ?? NOOP;
}

const DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<PushToast>(
    (message, variant = "success") => {
      if (!message) return;
      const id = (nextId.current += 1);
      setToasts((list) => [...list, { id, message, variant }]);
      timers.current.push(setTimeout(() => remove(id), DISMISS_MS));
    },
    [remove]
  );

  // Don't leave timers running against an unmounted tree.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  return (
    <ToastContext.Provider value={push}>
      {children}

      {/* Above the modal layer (z-50) so feedback is visible over a dialog. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lift ${
              t.variant === "error"
                ? "border-danger/30 bg-white"
                : "border-good/30 bg-white"
            }`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white ${
                t.variant === "error" ? "bg-danger" : "bg-good"
              }`}
            >
              {t.variant === "error" ? (
                <span className="text-xs font-bold leading-none">!</span>
              ) : (
                <Icon name="check" size={12} />
              )}
            </span>
            <p className="min-w-0 flex-1 text-sm text-ink">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1 text-faint transition hover:bg-chrome-100 hover:text-ink"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Announce the result of a `useFormState` action as a toast. Fires once per
 * submission because `useFormState` hands back a fresh state object each time,
 * so repeating the same error still re-announces it.
 */
export function useActionToast(
  state: ActionState,
  opts?: { success?: string }
) {
  const toast = useToast();
  const successText = opts?.success ?? "Saved.";

  useEffect(() => {
    if (!state) return;
    if (state.error) toast(state.error, "error");
    else if (state.ok) toast(successText, "success");
  }, [state, toast, successText]);
}
