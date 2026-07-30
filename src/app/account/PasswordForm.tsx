"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { changePassword } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function PasswordForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state, { success: "Password changed." });

  // Clear the fields after a successful change.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <Field label="Current password" htmlFor="currentPassword" required>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters.">
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.ok && <p className="text-sm text-good">Password updated.</p>}
      </div>
    </form>
  );
}
