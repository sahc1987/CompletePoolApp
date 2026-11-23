"use client";

import { useFormState } from "react-dom";
import { saveChecklist } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { ModalCancel, useCloseOnSuccess } from "@/components/Modal";
import { Field } from "@/components/Field";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";
import { MAX_CHECKLIST_ITEMS } from "@/contracts/checklist";

/** A service's checklist as plain text: one item per line, in the order workers see them. */
export default function ChecklistForm({
  serviceId,
  items,
}: {
  serviceId: string;
  items: string[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveChecklist, null);
  useCloseOnSuccess(state, { success: "Checklist saved." });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="serviceId" value={serviceId} />
      <Field
        label="Checklist items"
        htmlFor={`checklist-${serviceId}`}
        hint={`One item per line, up to ${MAX_CHECKLIST_ITEMS}. Workers tick them off on the job. It's a reminder: they can still submit with items unticked, and you see what was missed when you review.`}
      >
        <textarea
          id={`checklist-${serviceId}`}
          name="items"
          rows={8}
          defaultValue={items.join("\n")}
          placeholder={"Skim the surface\nEmpty skimmer baskets\nBrush walls and steps\nCheck the pump pressure"}
          className={inputClass}
        />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <ModalCancel />
        <SubmitButton pendingLabel="Saving…">Save checklist</SubmitButton>
      </div>
    </form>
  );
}
