"use client";

import { useFormState } from "react-dom";
import { sendInvoiceEmail } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { ModalButton, ModalCancel, useCloseOnSuccess } from "@/components/Modal";
import type { ActionState } from "@/lib/actions";

function Fields({ billId, email }: { billId: string; email: string | null }) {
  const [state, formAction] = useFormState<ActionState, FormData>(sendInvoiceEmail, null);
  useCloseOnSuccess(state, { success: "Invoice emailed." });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="billId" value={billId} />

      {email ? (
        <p className="text-sm text-muted">
          The invoice is attached as a PDF, with a link to pay online. It goes to{" "}
          <span className="font-semibold text-ink">{email}</span>.
        </p>
      ) : (
        <p className="text-sm text-danger">
          This client has no email address. Add one on the Clients page, then come back.
        </p>
      )}

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <ModalCancel />
        {email && <SubmitButton pendingLabel="Sending…">Send invoice</SubmitButton>}
      </div>
    </form>
  );
}

export default function EmailInvoiceButton({
  billId,
  clientName,
  email,
}: {
  billId: string;
  clientName: string;
  email: string | null;
}) {
  return (
    <ModalButton
      label="Email"
      title="Email invoice"
      subtitle={clientName}
      icon={null}
      className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100"
    >
      <Fields billId={billId} email={email} />
    </ModalButton>
  );
}
