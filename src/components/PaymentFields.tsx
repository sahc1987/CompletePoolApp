"use client";

import { useState } from "react";
import { Field } from "./Field";
import AddressAutocomplete from "./AddressAutocomplete";
import { inputClass, selectClass } from "./styles";

// Payment capture fields shared by the billing page and the calendar's job
// modal. Amount defaults to the full balance but can be reduced to take a
// partial payment. Check and card payments ask for their extra details.
export default function PaymentFields({ balance }: { balance: number }) {
  const [method, setMethod] = useState<"CASH" | "CHECK" | "ONLINE">("CASH");

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label="Amount paid"
        htmlFor="pay-amount"
        required
        hint={`Balance due ${balance.toFixed(2)} — enter less to take a partial payment.`}
      >
        <input
          id="pay-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          max={balance}
          defaultValue={balance.toFixed(2)}
          required
          className={inputClass}
        />
      </Field>

      <Field label="Method" htmlFor="pay-method" required>
        <select
          id="pay-method"
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          className={selectClass}
        >
          <option value="CASH">Cash</option>
          <option value="CHECK">Check</option>
          <option value="ONLINE">Online / Card</option>
        </select>
      </Field>

      {method === "CHECK" && (
        <Field label="Check number" htmlFor="pay-check" required>
          <input
            id="pay-check"
            name="checkNumber"
            required
            placeholder="e.g. 1042"
            className={inputClass}
          />
        </Field>
      )}

      {method === "ONLINE" && (
        <Field
          label="Billing address"
          htmlFor="pay-address"
          required
          hint="Address on the card."
        >
          <AddressAutocomplete
            id="pay-address"
            name="billingAddress"
            required
            placeholder="142 Ocean Ave, Long Beach, NY"
          />
        </Field>
      )}

      <Field label="Note" htmlFor="pay-note">
        <input
          id="pay-note"
          name="note"
          placeholder="Optional"
          className={inputClass}
        />
      </Field>
    </div>
  );
}
