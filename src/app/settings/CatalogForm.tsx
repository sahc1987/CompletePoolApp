"use client";

import { useFormState } from "react-dom";
import SubmitButton from "@/components/SubmitButton";
import { useCloseOnSuccess, ModalCancel } from "@/components/Modal";
import { inputClass, labelClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number";
  step?: string;
  placeholder?: string;
  defaultValue?: string | number;
  required?: boolean;
};

// One form used for every settings catalog (services, extras, tax rates),
// in both create and edit mode. `id` empty = create, present = edit.
export default function CatalogForm({
  action,
  fields,
  id,
  submitLabel,
  variant = "primary",
  layout = "inline",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Field[];
  id?: string;
  submitLabel: string;
  variant?: "primary" | "ghost";
  /** "inline" packs a row for editing in place; "stacked" fills a dialog. */
  layout?: "inline" | "stacked";
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, null);
  useCloseOnSuccess(state);

  const stacked = layout === "stacked";

  return (
    <form
      action={formAction}
      className={stacked ? "space-y-5" : "flex flex-wrap items-end gap-3"}
    >
      {id && <input type="hidden" name="id" value={id} />}

      <div className={stacked ? "grid gap-5 sm:grid-cols-2" : "contents"}>
        {fields.map((f) => (
          <div
            key={f.name}
            className={
              stacked
                ? f.type === "number"
                  ? ""
                  : "sm:col-span-2"
                : f.type === "number"
                  ? "w-28"
                  : "min-w-[10rem] flex-1"
            }
          >
            <label className={labelClass} htmlFor={`${f.name}-${id ?? "new"}`}>
              {f.label}
            </label>
            <input
              id={`${f.name}-${id ?? "new"}`}
              name={f.name}
              type={f.type ?? "text"}
              step={f.step}
              placeholder={f.placeholder}
              required={f.required}
              defaultValue={f.defaultValue}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      {state?.error && <p className="w-full text-sm text-danger">{state.error}</p>}
      {!stacked && state?.ok && <p className="w-full text-sm text-good">Saved.</p>}

      {stacked ? (
        <div className="flex items-center justify-end gap-2 border-t border-line/70 pt-4">
          <ModalCancel />
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </div>
      ) : (
        <SubmitButton variant={variant} pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      )}
    </form>
  );
}
