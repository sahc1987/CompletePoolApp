"use client";

import { useFormStatus } from "react-dom";
import { btnPrimary, btnGhost } from "./styles";

// Submit button that disables itself and shows a pending label while the
// server action it belongs to is running. Must be rendered inside a <form>.
export default function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  fullWidth,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "ghost";
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${variant === "primary" ? btnPrimary : btnGhost} ${fullWidth ? "w-full" : ""}`}
    >
      {pending ? pendingLabel ?? "Saving…" : children}
    </button>
  );
}
