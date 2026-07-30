"use client";

import { useFormState } from "react-dom";
import { createClient, updateClient } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useCloseOnSuccess, ModalCancel } from "@/components/Modal";
import { inputClass, labelClass } from "@/components/styles";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { ActionState } from "@/lib/actions";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export default function ClientForm({ client }: { client?: Client }) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    client ? updateClient : createClient,
    null
  );
  useCloseOnSuccess(state, {
    success: client ? "Client details saved." : "Client added.",
  });

  return (
    <form action={formAction} className="space-y-5">
      {client && <input type="hidden" name="id" value={client.id} />}

      <div>
        <label className={labelClass} htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={client?.name ?? ""}
          className={inputClass}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            defaultValue={client?.phone ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={client?.email ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="address">
          Address
        </label>
        <AddressAutocomplete
          id="address"
          name="address"
          defaultValue={client?.address ?? ""}
          placeholder="Start typing an address…"
        />
        <p className="mt-1.5 text-xs text-faint">
          Billing or mailing address. Each pool has its own service address.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={client?.notes ?? ""}
          className={inputClass}
        />
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">Saved.</p>}

      <div className="flex items-center justify-end gap-2">
        <ModalCancel />
        <SubmitButton pendingLabel={client ? "Saving…" : "Adding…"}>
          {client ? "Save changes" : "Add client"}
        </SubmitButton>
      </div>
    </form>
  );
}
