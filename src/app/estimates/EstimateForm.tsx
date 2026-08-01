"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { createEstimate } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { ModalCancel } from "@/components/Modal";
import { useActionToast } from "@/components/Toast";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { inputClass, selectClass, labelClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type Client = { id: string; name: string; pools: { id: string; address: string }[] };

export default function EstimateForm({ clients }: { clients: Client[] }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createEstimate, null);
  useActionToast(state, { success: "Estimate created." });
  // Workers quote prospects who aren't customers yet, so the form can create
  // the client inline. With an empty book there's nothing to pick — start on
  // the new-customer side.
  const [mode, setMode] = useState<"existing" | "new">(
    clients.length > 0 ? "existing" : "new"
  );
  const [clientId, setClientId] = useState("");

  const pools = useMemo(
    () => clients.find((c) => c.id === clientId)?.pools ?? [],
    [clients, clientId]
  );

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
      active ? "bg-navy-700 text-white" : "text-ink hover:bg-chrome-100"
    }`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />

      <div className="flex rounded-full border border-line bg-white p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => setMode("existing")}
          disabled={clients.length === 0}
          className={`${tabClass(mode === "existing")} disabled:opacity-40`}
        >
          Existing customer
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={tabClass(mode === "new")}
        >
          New customer
        </button>
      </div>

      {mode === "existing" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="clientId">Client</label>
            <select
              id="clientId"
              name="clientId"
              required
              className={selectClass}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="poolId">Pool (optional)</label>
            <select id="poolId" name="poolId" className={selectClass} disabled={!clientId}>
              <option value="">— none —</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="newName">Customer name</label>
            <input id="newName" name="newName" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="newPhone">Phone (optional)</label>
            <input id="newPhone" name="newPhone" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="newEmail">Email (optional)</label>
            <input id="newEmail" name="newEmail" type="email" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="newAddress">Service address (optional)</label>
            <AddressAutocomplete
              id="newAddress"
              name="newAddress"
              placeholder="Start typing an address…"
            />
            <p className="mt-1.5 text-xs text-faint">
              Saved as the customer&apos;s address and as their first pool.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="validUntil">Valid until (optional)</label>
          <input id="validUntil" name="validUntil" type="date" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={2} className={inputClass} />
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center justify-end gap-2">
        <ModalCancel />
        <SubmitButton pendingLabel="Creating…">Create draft estimate</SubmitButton>
      </div>
    </form>
  );
}
