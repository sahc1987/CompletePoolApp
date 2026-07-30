"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { submitTask } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type Material = { id: string; name: string; unit: string };

export default function SubmitTaskForm({
  taskId,
  materials,
}: {
  taskId: string;
  materials: Material[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(submitTask, null);
  useActionToast(state, { success: "Job submitted for review." });
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-gradient-to-b from-teal-700 to-teal-800 px-5 py-2.5 font-bold text-white shadow-sm transition hover:from-teal-800 hover:to-teal-900"
        >
          Submit for review
        </button>
      ) : (
        <form action={formAction} className="w-64 space-y-2 rounded-lg border border-line p-3">
          <input type="hidden" name="taskId" value={taskId} />
          <p className="text-sm font-medium text-muted">Materials used (optional)</p>
          {materials.length === 0 && (
            <p className="text-xs text-faint">No materials in the catalog.</p>
          )}
          {materials.map((m) => (
            <label key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {m.name} <span className="text-faint">({m.unit})</span>
              </span>
              <input
                name={`qty_${m.id}`}
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                className={`${inputClass} w-20`}
              />
            </label>
          ))}
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <SubmitButton pendingLabel="Submitting…">Confirm submit</SubmitButton>
        </form>
      )}
    </div>
  );
}
