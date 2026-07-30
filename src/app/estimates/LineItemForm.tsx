"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { addLineItem } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { inputClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type CatalogItem = { name: string; price: number; kind: string };

export default function LineItemForm({
  estimateId,
  catalog,
}: {
  estimateId: string;
  catalog: CatalogItem[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(addLineItem, null);
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const listId = `catalog-${estimateId}`;

  // Reset the row after a successful add.
  useEffect(() => {
    if (state?.ok) {
      setDescription("");
      setUnitPrice("");
      formRef.current?.reset();
    }
  }, [state]);

  // When the typed description matches a catalog entry, auto-fill its price.
  function onDescChange(value: string) {
    setDescription(value);
    const match = catalog.find(
      (c) => c.name.toLowerCase() === value.trim().toLowerCase()
    );
    if (match) setUnitPrice(String(match.price));
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="estimateId" value={estimateId} />

      <div className="min-w-[14rem] flex-1">
        <input
          name="description"
          list={listId}
          placeholder="Start typing a service, extra, or material…"
          required
          autoComplete="off"
          value={description}
          onChange={(e) => onDescChange(e.target.value)}
          className={inputClass}
        />
        <datalist id={listId}>
          {catalog.map((c) => (
            <option key={`${c.kind}-${c.name}`} value={c.name}>
              {c.kind} · ${c.price}
            </option>
          ))}
        </datalist>
      </div>

      <input
        name="quantity"
        type="number"
        step="0.01"
        min="0"
        defaultValue={1}
        required
        className={`${inputClass} w-20`}
        aria-label="Quantity"
      />
      <input
        name="unitPrice"
        type="number"
        step="0.01"
        min="0"
        placeholder="Unit $"
        required
        value={unitPrice}
        onChange={(e) => setUnitPrice(e.target.value)}
        className={`${inputClass} w-28`}
        aria-label="Unit price"
      />
      <SubmitButton variant="ghost" pendingLabel="Adding…">
        Add line
      </SubmitButton>

      {state?.error && <p className="w-full text-sm text-danger">{state.error}</p>}
      {catalog.length > 0 && (
        <p className="w-full text-xs text-faint">
          Tip: pick a saved service, extra, or material to auto-fill its price — or
          type your own.
        </p>
      )}
    </form>
  );
}
