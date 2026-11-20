"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { saveEmailSettings } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

/**
 * Connect the Gmail account that emails invoices. "Test and save" signs in to
 * Google first; if that fails nothing is stored, so the app never half-trusts a
 * setup that doesn't work.
 */
export default function EmailForm({
  connected,
  user,
  fromName,
}: {
  connected: boolean;
  /** Null on the public demo, which must not show the real address. */
  user: string | null;
  fromName: string | null;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveEmailSettings, null);
  useActionToast(state, { success: "Email connected. You can now email invoices." });

  // The password should not sit in the box after a successful save.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="space-y-4">
      <p className="text-sm">
        {connected ? (
          <span className="rounded-full bg-good/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">
            Connected
          </span>
        ) : (
          <span className="rounded-full bg-pending/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-pending">
            Not set up
          </span>
        )}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gmail address" htmlFor="email-user" required hint="The account invoices are sent from.">
          <input
            id="email-user"
            name="user"
            type="email"
            required
            autoComplete="off"
            defaultValue={user ?? ""}
            placeholder="billing@yourcompany.com"
            className={inputClass}
          />
        </Field>
        <Field label="App password" htmlFor="email-password" required hint="Not your normal password — see the steps below.">
          <input
            id="email-password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder={connected ? "Enter again to change" : "16 characters from Google"}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Sender name" htmlFor="email-from" hint="What customers see, e.g. Complete Pool Service. Optional.">
        <input
          id="email-from"
          name="fromName"
          maxLength={80}
          defaultValue={fromName ?? ""}
          className={inputClass}
        />
      </Field>

      <details className="rounded-xl border border-line/80 bg-surface/60 px-4 py-3 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-ink">How to get an app password</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Turn on 2-step verification for the Google account.</li>
          <li>
            Open{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-navy-700 underline"
            >
              Google app passwords
            </a>
            , name it &ldquo;Complete Pool&rdquo;, and create it.
          </li>
          <li>Paste the 16-character password above. Spaces are fine.</li>
        </ol>
      </details>

      <p className="text-xs text-faint">
        Saving signs in to Google first. If that doesn&apos;t work, nothing is saved.
      </p>

      <div className="flex items-center justify-end gap-3">
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton pendingLabel="Testing…">Test and save</SubmitButton>
      </div>
    </form>
  );
}
