"use client";

import { useFormState } from "react-dom";
import { createPool, updatePool } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useCloseOnSuccess, ModalCancel } from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { inputClass, labelClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type Pool = {
  id: string;
  address: string;
  size: string | null;
  type: string | null;
};

export default function PoolForm({
  clientId,
  pool,
}: {
  clientId: string;
  pool?: Pool;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    pool ? updatePool : createPool,
    null
  );
  useCloseOnSuccess(state);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      {pool && <input type="hidden" name="id" value={pool.id} />}

      <div>
        <label className={labelClass} htmlFor={`addr-${pool?.id ?? "new"}`}>
          Address
        </label>
        <AddressAutocomplete
          id={`addr-${pool?.id ?? "new"}`}
          name="address"
          required
          defaultValue={pool?.address ?? ""}
          placeholder="Start typing an address…"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`size-${pool?.id ?? "new"}`}>
            Size
          </label>
          <input
            id={`size-${pool?.id ?? "new"}`}
            name="size"
            placeholder="e.g. 20,000 gal"
            defaultValue={pool?.size ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`type-${pool?.id ?? "new"}`}>
            Type
          </label>
          <input
            id={`type-${pool?.id ?? "new"}`}
            name="type"
            placeholder="e.g. In-ground"
            defaultValue={pool?.type ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">Saved.</p>}

      <div className={`flex items-center gap-2 ${pool ? "" : "justify-end"}`}>
        <ModalCancel />
        <SubmitButton variant={pool ? "ghost" : "primary"} pendingLabel="Saving…">
          {pool ? "Save pool" : "Add pool"}
        </SubmitButton>
      </div>
    </form>
  );
}
