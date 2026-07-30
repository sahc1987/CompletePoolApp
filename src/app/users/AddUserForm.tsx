"use client";

import { useFormState } from "react-dom";
import { createUser } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useCloseOnSuccess, ModalCancel } from "@/components/Modal";
import { inputClass, selectClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function AddUserForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(createUser, null);
  useCloseOnSuccess(state, { success: "User added." });

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="new-name" required>
          <input id="new-name" name="name" required className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="new-email" required hint="Used to sign in.">
          <input id="new-email" name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Phone" htmlFor="new-phone">
          <input id="new-phone" name="phone" className={inputClass} placeholder="516-555-0000" />
        </Field>
        <Field label="Role" htmlFor="new-role" required>
          <select id="new-role" name="role" defaultValue="WORKER" className={selectClass}>
            <option value="WORKER">Worker</option>
            <option value="ADMIN">Admin</option>
            <option value="OWNER">Owner</option>
          </select>
        </Field>
      </div>

      <Field
        label="Temporary password"
        htmlFor="new-password"
        required
        hint="At least 8 characters. They can change it from My account."
      >
        <input
          id="new-password"
          name="password"
          type="text"
          required
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <ModalCancel />
        <SubmitButton pendingLabel="Creating…">Create user</SubmitButton>
      </div>
    </form>
  );
}
