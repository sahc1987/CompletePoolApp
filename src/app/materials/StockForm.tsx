"use client";

import { useFormState } from "react-dom";
import { adjustStock } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useCloseOnSuccess } from "@/components/Modal";
import { inputClass, selectClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function StockForm({ materialId }: { materialId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(adjustStock, null);
  useCloseOnSuccess(state, { success: "Stock updated." });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="materialId" value={materialId} />
      <select name="type" className={`${selectClass} w-36`} defaultValue="RESTOCK">
        <option value="RESTOCK">Restock (+)</option>
        <option value="ADJUSTMENT">Adjust (±)</option>
      </select>
      <input
        name="quantity"
        type="number"
        step="0.01"
        placeholder="Qty"
        required
        className={`${inputClass} w-24`}
      />
      <input name="note" placeholder="Note (optional)" className={`${inputClass} w-40`} />
      <SubmitButton variant="ghost" pendingLabel="…">
        Apply
      </SubmitButton>
      {state?.error && <p className="w-full text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-good">Stock updated.</p>}
    </form>
  );
}
