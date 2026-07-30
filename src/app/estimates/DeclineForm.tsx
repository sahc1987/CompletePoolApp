"use client";

import { useFormState } from "react-dom";
import { declineEstimate } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function DeclineForm({ estimateId }: { estimateId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(declineEstimate, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="estimateId" value={estimateId} />
      <input
        name="declineReason"
        placeholder="Reason (optional)"
        className={inputClass}
      />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton variant="ghost" pendingLabel="Saving…">
        Client declined
      </SubmitButton>
    </form>
  );
}
