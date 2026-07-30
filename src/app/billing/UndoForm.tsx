"use client";

import { useFormState } from "react-dom";
import { markBillUnpaid } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { ModalButton, ModalCancel, useCloseOnSuccess } from "@/components/Modal";
import { Field } from "@/components/Field";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

// Common reasons an admin undoes a bill's payments. Free text is still allowed.
const REASONS = [
  "Check rejected",
  "Card payment declined / chargeback",
  "Recorded in error",
  "Refunded to customer",
];

function Fields({ billId }: { billId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    markBillUnpaid,
    null
  );
  useCloseOnSuccess(state, { success: "Payments reversed — bill is unpaid again." });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="billId" value={billId} />

      <p className="text-sm text-muted">
        This removes every payment on the bill and sets it back to pending. The
        reason is kept as a record.
      </p>

      <Field
        label="Reason"
        htmlFor="undo-reason"
        required
        hint="Why are the payments being undone?"
      >
        <input
          id="undo-reason"
          name="reason"
          required
          list="undo-reason-options"
          placeholder="e.g. Check rejected"
          className={inputClass}
        />
        <datalist id="undo-reason-options">
          {REASONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <ModalCancel />
        <SubmitButton pendingLabel="Undoing…">Undo payments</SubmitButton>
      </div>
    </form>
  );
}

export default function UndoForm({
  billId,
  clientName,
}: {
  billId: string;
  clientName: string;
}) {
  return (
    <ModalButton
      label="Undo"
      title="Undo payments"
      subtitle={clientName}
      icon={null}
      className="rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-faint transition hover:bg-danger/10 hover:text-danger"
    >
      <Fields billId={billId} />
    </ModalButton>
  );
}
