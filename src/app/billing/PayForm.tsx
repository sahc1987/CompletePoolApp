"use client";

import { useFormState } from "react-dom";
import { payBill } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import PaymentFields from "@/components/PaymentFields";
import { ModalButton, ModalCancel, useCloseOnSuccess } from "@/components/Modal";
import type { ActionState } from "@/lib/actions";

function Fields({ billId, balance }: { billId: string; balance: number }) {
  const [state, formAction] = useFormState<ActionState, FormData>(payBill, null);
  useCloseOnSuccess(state, { success: "Payment recorded." });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="billId" value={billId} />
      <PaymentFields balance={balance} />

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <ModalCancel />
        <SubmitButton pendingLabel="Saving…">Save payment</SubmitButton>
      </div>
    </form>
  );
}

export default function PayForm({
  billId,
  clientName,
  balance,
}: {
  billId: string;
  clientName: string;
  balance: number;
}) {
  return (
    <ModalButton
      label="Record payment"
      // Compact on phones ("Pay") so the action never clips in the dense table;
      // full label from sm up where there's room.
      labelNode={
        <>
          <span className="sm:hidden">Pay</span>
          <span className="hidden sm:inline">Record payment</span>
        </>
      }
      title="Record a payment"
      subtitle={clientName}
      icon={null}
      // Quiet by default so the money — not the buttons — leads the row.
      className="whitespace-nowrap rounded-full border border-navy-700/25 px-3 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-navy-700 hover:text-white active:scale-[.98] sm:px-3.5"
    >
      <Fields billId={billId} balance={balance} />
    </ModalButton>
  );
}
