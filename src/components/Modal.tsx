"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { btnPrimary, btnBlue, btnGhost } from "./styles";
import type { ActionState } from "@/lib/actions";

// Forms live inside the dialog but own their own submit result, so they need a
// way to dismiss the thing wrapping them. Null outside a modal, which makes
// `useModalClose()` safe to call from a form used both inline and in a dialog.
const ModalCloseContext = createContext<(() => void) | null>(null);

export function useModalClose() {
  return useContext(ModalCloseContext);
}

/**
 * Dismiss the surrounding dialog and pull in fresh data once an action
 * succeeds. Outside a modal it just refreshes, so forms can use it in both
 * places without branching.
 */
export function useCloseOnSuccess(state: ActionState) {
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (!state?.ok) return;
    close?.();
    router.refresh();
  }, [state, close, router]);
}

/**
 * Cancel button for a form inside a dialog. Renders nothing when the form is
 * used inline, where there's nothing to back out of.
 */
export function ModalCancel({ label = "Cancel" }: { label?: string }) {
  const close = useModalClose();
  if (!close) return null;

  return (
    <button type="button" onClick={close} className={btnGhost}>
      {label}
    </button>
  );
}

const SIZE = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export type ModalSize = keyof typeof SIZE;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape to close, and keep Tab inside the dialog while it owns the screen.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the dialog is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Land the caret in the first real field so the dialog is usable without
  // reaching for the mouse.
  useEffect(() => {
    if (!open) return;
    const target = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea'
    );
    target?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        // `text-left`: triggers often sit in right-aligned table cells, and the
        // dialog would otherwise inherit that alignment.
        className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-line bg-white text-left shadow-lift sm:max-h-[90vh] sm:rounded-2xl ${SIZE[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 shrink-0 rounded-full p-2 text-faint transition hover:bg-chrome-100 hover:text-ink"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <ModalCloseContext.Provider value={onClose}>
            {children}
          </ModalCloseContext.Provider>
        </div>
      </div>
    </div>
  );
}

/**
 * Trigger + dialog in one. Server components can pass a form as `children`.
 * The body only mounts while open, so every open starts from a clean form.
 */
export function ModalButton({
  label,
  labelNode,
  title,
  subtitle,
  icon = "plus",
  size,
  variant = "primary",
  className,
  children,
}: {
  label: string;
  /** Optional richer trigger content (e.g. a label that shortens on phones).
   *  Falls back to `label`; `label` is still used for the title default. */
  labelNode?: React.ReactNode;
  /** Dialog heading. Defaults to the trigger label. */
  title?: string;
  subtitle?: string;
  icon?: IconName | null;
  size?: ModalSize;
  variant?: "primary" | "blue" | "ghost";
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Send focus back to the trigger, or a keyboard user is dumped at the top
  // of the document.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const variantClass =
    variant === "blue" ? btnBlue : variant === "ghost" ? btnGhost : btnPrimary;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? variantClass}
      >
        {icon && <Icon name={icon} size={16} />}
        {labelNode ?? label}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={title ?? label}
        subtitle={subtitle}
        size={size}
      >
        {children}
      </Modal>
    </>
  );
}
