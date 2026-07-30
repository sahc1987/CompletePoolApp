"use client";

import SubmitButton from "./SubmitButton";

// A minimal form that fires a server action with some hidden fields and a
// pending-aware submit button. Used for one-click state transitions (start,
// submit, approve, etc.) where no extra input is needed.
export default function ActionForm({
  action,
  hidden,
  label,
  pendingLabel,
  variant = "primary",
  className,
  fullWidth,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "ghost";
  className?: string;
  /** Stretch the button — thumb-friendly primary actions on mobile. */
  fullWidth?: boolean;
}) {
  return (
    <form action={action} className={className}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} pendingLabel={pendingLabel} fullWidth={fullWidth}>
        {label}
      </SubmitButton>
    </form>
  );
}
