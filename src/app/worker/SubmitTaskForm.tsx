"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { submitTask } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import MaterialUsageFields, {
  type MaterialOption,
} from "@/components/MaterialUsageFields";
import { useActionToast } from "@/components/Toast";
import { btnPrimary, btnGhost } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function SubmitTaskForm({
  taskId,
  materials,
}: {
  taskId: string;
  materials: MaterialOption[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(submitTask, null);
  useActionToast(state, { success: "Job submitted for review." });
  const [open, setOpen] = useState(false);

  // Full width and thumb-sized, matching the "Start job" button this replaces
  // in the card.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btnPrimary} w-full`}
      >
        Submit for review
      </button>
    );
  }

  return (
    // Full width on a phone — this is filled in one-handed, standing at a pool.
    // The old fixed 16rem box left the material rows squeezed against it.
    <form
      action={formAction}
      className="w-full space-y-4 rounded-2xl border border-line/70 bg-surface p-4"
    >
      <input type="hidden" name="taskId" value={taskId} />

      <MaterialUsageFields
        materials={materials}
        label="Materials used (optional)"
        hint="Comes off stock and is added to the customer's bill."
      />

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          Cancel
        </button>
        <SubmitButton pendingLabel="Submitting…">Confirm submit</SubmitButton>
      </div>
    </form>
  );
}
