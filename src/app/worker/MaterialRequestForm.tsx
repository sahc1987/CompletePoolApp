"use client";

import { useFormState } from "react-dom";
import { createMaterialRequest } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useCloseOnSuccess, ModalCancel } from "@/components/Modal";
import { inputClass, selectClass, labelClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type Material = { id: string; name: string; unit: string };
type Task = { id: string; label: string };

export default function MaterialRequestForm({
  materials,
  tasks,
}: {
  materials: Material[];
  tasks: Task[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    createMaterialRequest,
    null
  );
  useCloseOnSuccess(state, { success: "Material request sent." });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="materialId">Material</label>
          <select id="materialId" name="materialId" className={selectClass} defaultValue="">
            <option value="">— from catalog —</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="quantityRequested">Quantity</label>
          <input
            id="quantityRequested"
            name="quantityRequested"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="description">
          Or describe something not in the catalog
        </label>
        <input
          id="description"
          name="description"
          placeholder="e.g. a new pool brush"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="taskId">For a specific job? (optional)</label>
        <select id="taskId" name="taskId" className={selectClass} defaultValue="">
          <option value="">— general restock —</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="urgent" />
        Urgent — this is blocking a job right now
      </label>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-line/70 pt-4">
        <ModalCancel />
        <SubmitButton pendingLabel="Sending…">Request materials</SubmitButton>
      </div>
    </form>
  );
}
