"use client";

import { useFormState } from "react-dom";
import { saveReminderSetting } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useActionToast } from "@/components/Toast";
import type { ActionState } from "@/lib/actions";

/**
 * The on/off switch for automatic overdue reminders. Off by default, and can't
 * be turned on until email is connected, so nothing is emailed by surprise.
 */
export default function RemindersForm({
  connected,
  enabled,
}: {
  connected: boolean;
  enabled: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveReminderSetting, null);
  useActionToast(state, { success: "Reminder setting saved." });

  return (
    <form action={formAction} className="mt-6 space-y-3 border-t border-line/70 pt-5">
      <h3 className="text-base font-semibold text-ink">Overdue reminders</h3>

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          disabled={!connected}
          className="mt-1 h-4 w-4"
        />
        <span>
          Email customers automatically when an invoice is still unpaid
          <span className="mt-0.5 block text-muted">
            A reminder goes out 7, 14 and 30 days after the invoice (three at most), with the pay
            link and the invoice attached. Only customers with an email address get one. Unpaid
            invoices older than 7 days get their first reminder the next time it runs, which is
            once a day.
          </span>
        </span>
      </label>
      {!connected && (
        <p className="text-sm text-muted">Connect an email account above to turn this on.</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
