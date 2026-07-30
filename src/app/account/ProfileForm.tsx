"use client";

import { useFormState } from "react-dom";
import { updateProfile } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function ProfileForm({
  name,
  phone,
}: {
  name: string;
  phone: string | null;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateProfile, null);
  useActionToast(state, { success: "Profile saved." });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" required>
          <input id="name" name="name" required defaultValue={name} className={inputClass} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <input id="phone" name="phone" defaultValue={phone ?? ""} className={inputClass} placeholder="516-555-0000" />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.ok && <p className="text-sm text-good">Profile updated.</p>}
      </div>
    </form>
  );
}
