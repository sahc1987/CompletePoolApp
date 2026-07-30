"use client";

import { useFormState } from "react-dom";
import { respondMaterialRequest } from "./actions";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function RespondForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    respondMaterialRequest,
    null
  );
  useActionToast(state, { success: "Request answered." });

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input name="note" placeholder="Note (optional)" className={`${inputClass} w-44`} />
      <button
        type="submit"
        name="decision"
        value="APPROVED"
        className="rounded-full bg-good px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Approve
      </button>
      <button
        type="submit"
        name="decision"
        value="DENIED"
        className="rounded-full border border-danger/40 px-4 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10"
      >
        Deny
      </button>
      {state?.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
