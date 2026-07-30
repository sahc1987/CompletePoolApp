"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { createEstimate } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { ModalCancel } from "@/components/Modal";
import { inputClass, selectClass, labelClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type Client = { id: string; name: string; pools: { id: string; address: string }[] };

export default function EstimateForm({ clients }: { clients: Client[] }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createEstimate, null);
  const [clientId, setClientId] = useState("");

  const pools = useMemo(
    () => clients.find((c) => c.id === clientId)?.pools ?? [],
    [clients, clientId]
  );

  return (
    <form action={formAction} className="space-y-4">
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
