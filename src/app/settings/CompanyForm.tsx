"use client";

import { useFormState } from "react-dom";
import { saveCompanyInfo } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { useActionToast } from "@/components/Toast";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";
import type { CompanyInfo } from "@/lib/company";

/** The business identity printed on invoices and receipts. */
export default function CompanyForm({ company }: { company: CompanyInfo }) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveCompanyInfo, null);
  useActionToast(state, { success: "Company details updated." });

  const text = (name: keyof CompanyInfo, label: string, opts: { required?: boolean; placeholder?: string; hint?: string; type?: string } = {}) => (
    <Field label={label} htmlFor={`company-${name}`} required={opts.required} hint={opts.hint}>
      <input
        id={`company-${name}`}
        name={name}
        type={opts.type ?? "text"}
        required={opts.required}
        defaultValue={company[name] ?? ""}
        placeholder={opts.placeholder}
        className={inputClass}
      />
    </Field>
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Company name", { required: true })}
        {text("tagline", "Tagline", { placeholder: "Pool maintenance & repair" })}
        {text("phone", "Phone", { type: "tel" })}
        {text("email", "Email", { type: "email" })}
        {text("website", "Website")}
        {text("taxId", "Tax ID / licence no.", { hint: "Printed under the address." })}
      </div>
      {text("address", "Address")}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("paymentTerms", "Payment terms", { placeholder: "Due upon receipt" })}
        {text("paymentNote", "How to pay", { hint: "Shown under the totals on an unpaid invoice." })}
      </div>
      {text("documentFooter", "Closing line", { hint: "At the foot of every invoice and receipt, e.g. a warranty or thank-you." })}

      <p className="text-xs text-faint">
        Used on the next invoice or receipt. Documents already sent don&apos;t change.
      </p>

      <div className="flex items-center justify-end gap-3">
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton pendingLabel="Saving…">Save company details</SubmitButton>
      </div>
    </form>
  );
}
