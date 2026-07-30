"use client";

import { useFormState } from "react-dom";
import { resetUserPassword } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { ModalButton, useModalClose } from "@/components/Modal";
import { inputClass, btnGhost } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

// Unlike the other dialogs this one stays open on success: the admin has to be
// able to read the password back before it disappears.
function Fields({ userId }: { userId: string }) {
  const close = useModalClose();
  const [state, formAction] = useFormState<ActionState, FormData>(resetUserPassword, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="userId" value={userId} />

      <Field label="New password" htmlFor={`pw-${userId}`} required hint="At least 8 characters.">
        <input
          id={`pw-${userId}`}
          name="password"
          type="text"
          required
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">Password updated.</p>}

      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <button type="button" onClick={() => close?.()} className={btnGhost}>
          {state?.ok ? "Close" : "Cancel"}
        </button>
        <SubmitButton pendingLabel="Saving…">Set password</SubmitButton>
      </div>
    </form>
  );
}

export default function ResetPasswordForm({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  return (
    <ModalButton
      label="Reset password"
      title="Reset password"
      subtitle={`Set a new password for ${name}. Share it with them directly — they can change it later from My account.`}
      icon={null}
      size="sm"
      className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-faint transition hover:bg-chrome-100 hover:text-navy-700"
    >
      <Fields userId={userId} />
    </ModalButton>
  );
}
