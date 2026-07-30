"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { saveEmployment } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function EmploymentForm({
  userId,
  hourlyRate,
  hiredOn,
  birthday,
}: {
  userId: string;
  /** Decimal serialised to a number, or null when unset. */
  hourlyRate: number | null;
  /** "YYYY-MM-DD" or "". */
  hiredOn: string;
  birthday: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    saveEmployment,
    null
  );
  useActionToast(state, { success: "Employment details saved." });

  const [rate, setRate] = useState(hourlyRate === null ? "" : String(hourlyRate));
  const rateChanged = rate !== (hourlyRate === null ? "" : String(hourlyRate));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="userId" value={userId} />

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Hourly pay ($)" htmlFor="hourlyRate">
          <input
            id="hourlyRate"
            name="hourlyRate"
            type="number"
            step="0.01"
            min={0}
            placeholder="—"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Hire date" htmlFor="hiredOn">
          <input
            id="hiredOn"
            name="hiredOn"
            type="date"
            defaultValue={hiredOn}
            className={inputClass}
          />
        </Field>
        <Field label="Birthday" htmlFor="birthday">
          <input
            id="birthday"
            name="birthday"
            type="date"
            defaultValue={birthday}
            className={inputClass}
          />
        </Field>
      </div>

      {/* Only offered when the rate actually moves — the note belongs to the
          pay-change record, not to the hire date or birthday. */}
      {rateChanged && rate !== "" && (
        <Field
          label="Reason for the pay change"
          htmlFor="note"
          hint="Saved to the pay history. Optional."
        >
          <input
            id="note"
            name="note"
            maxLength={200}
            placeholder="e.g. Annual review, promotion"
            className={inputClass}
          />
        </Field>
      )}

      <div className="flex items-center justify-end gap-3">
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
      </div>
    </form>
  );
}
