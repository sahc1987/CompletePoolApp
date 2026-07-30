"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { setUserRole } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useActionToast } from "@/components/Toast";
import { selectClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

const ROLES = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "WORKER", label: "Worker" },
];

// Privileges are deliberately an explicit save, not a change-and-it's-done
// select — a mis-click shouldn't silently re-permission someone.
export default function RoleForm({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: string;
  disabled?: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(setUserRole, null);
  useActionToast(state, { success: "Privileges updated." });
  const [value, setValue] = useState(role);
  const dirty = value !== role;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className={`${selectClass} w-32 py-1.5 text-sm`}
        aria-label="Role"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {dirty && !disabled && (
        <SubmitButton variant="ghost" pendingLabel="…">
          Save
        </SubmitButton>
      )}
      {state?.error && (
        <span className="text-xs font-medium text-danger">{state.error}</span>
      )}
    </form>
  );
}
