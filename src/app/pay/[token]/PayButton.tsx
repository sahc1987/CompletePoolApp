"use client";

import { useFormState, useFormStatus } from "react-dom";
import { payInvoice } from "./actions";
import type { ActionState } from "@/lib/actions";

function Submit({ label }: { label: string }) {
  // Disabled while the checkout is being opened, so a double tap sends one
  // request. The server reuses the bill's open checkout as well, so even two
  // requests can't produce two charges.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-gradient-to-b from-teal-700 to-teal-800 px-6 py-4 text-lg font-bold text-white shadow-sm transition hover:from-teal-800 hover:to-teal-900 disabled:opacity-60"
    >
      {pending ? "Opening secure checkout…" : label}
    </button>
  );
}

export default function PayButton({ token, label }: { token: string; label: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(payInvoice, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Submit label={label} />
      {state?.error && (
        <p role="alert" className="text-center text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
