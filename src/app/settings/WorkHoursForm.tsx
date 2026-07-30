"use client";

import { useFormState } from "react-dom";
import { saveWorkHours } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function WorkHoursForm({
  start,
  end,
}: {
  /** "HH:MM" local times. */
  start: string;
  end: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    saveWorkHours,
    null
  );
  useActionToast(state, { success: "Business hours updated." });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opens" htmlFor="workdayStart" required>
          <input
            id="workdayStart"
            name="workdayStart"
            type="time"
            required
            defaultValue={start}
            className={inputClass}
          />
        </Field>
        <Field label="Closes" htmlFor="workdayEnd" required>
          <input
            id="workdayEnd"
            name="workdayEnd"
            type="time"
            required
            defaultValue={end}
            className={inputClass}
          />
        </Field>
      </div>

      <p className="text-xs text-faint">
        Jobs must start no earlier than the opening time and finish by closing
        time. Jobs already on the calendar aren&apos;t changed.
      </p>

      <div className="flex items-center justify-end gap-3">
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton pendingLabel="Saving…">Save hours</SubmitButton>
      </div>
    </form>
  );
}
