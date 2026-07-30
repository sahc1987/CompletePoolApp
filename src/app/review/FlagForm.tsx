"use client";

import { useFormState } from "react-dom";
import { flagTask } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export default function FlagForm({ taskId }: { taskId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(flagTask, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input
        name="reason"
        placeholder="What needs fixing?"
        className={inputClass}
      />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton variant="ghost" pendingLabel="Flagging…">
        Flag &amp; return
      </SubmitButton>
    </form>
  );
}
