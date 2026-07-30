"use client";

import { useFormState } from "react-dom";
import { saveWorkHours } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass, selectClass } from "@/components/styles";
import { TIMEZONE_OPTIONS } from "@/lib/schedule";
import type { ActionState } from "@/lib/actions";

export default function WorkHoursForm({
  start,
  end,
  timezone,
}: {
  /** "HH:MM" in the business timezone. */
  start: string;
  end: string;
  timezone: string;
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

      <Field
        label="Timezone"
        htmlFor="timezone"
        required
        hint="The clock the whole business runs on — job times, business hours, and week totals are all read in this zone."
      >
        <select
          id="timezone"
          name="timezone"
          required
          defaultValue={timezone}
          className={selectClass}
        >
          {/* A stored zone outside the curated list still shows as selected. */}
          {!TIMEZONE_OPTIONS.some((t) => t.value === timezone) && (
            <option value={timezone}>{timezone}</option>
          )}
          {TIMEZONE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

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
