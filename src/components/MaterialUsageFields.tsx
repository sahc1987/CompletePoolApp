"use client";

import { useMemo, useState } from "react";
import { labelClass } from "./styles";

// Material capture, shared by the worker's "Submit for review" form and the
// calendar's finish panel, so a job is itemised the same way whichever route
// closes it out. Inputs are named `qty_<materialId>`, which is what
// `parseMaterialUsage` reads on the server.

export type MaterialOption = {
  id: string;
  name: string;
  unit: string;
};

// A narrow numeric box: same visual language as the shared inputClass, with
// tighter horizontal padding so the digits aren't squeezed into a sliver, and
// a 48px min height so it stays a comfortable thumb target on a phone.
// `form-qty` drops the native spinner arrows (see globals.css).
const qtyInputClass =
  "form-qty h-12 w-[4.5rem] rounded-xl border border-field bg-white px-2.5 text-center text-ink outline-none transition placeholder:text-faint hover:border-teal-700 hover:bg-teal-300/10 focus:border-teal-700 focus:bg-teal-300/10 focus:ring-4 focus:ring-teal-700/12 sm:w-20";

/** Long catalogs get a filter box; short ones don't need the extra chrome. */
const FILTER_THRESHOLD = 6;

export default function MaterialUsageFields({
  materials,
  label = "Materials used",
  hint,
}: {
  materials: MaterialOption[];
  label?: string;
  /** Line under the list explaining what recording usage does. */
  hint?: string;
}) {
  // Quantities are held here rather than left uncontrolled so a row can be
  // filtered out of view without losing what was typed into it.
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  const enteredCount = useMemo(
    () => Object.values(quantities).filter((v) => Number(v) > 0).length,
    [quantities]
  );

  if (materials.length === 0) {
    return (
      <div>
        <p className={labelClass}>{label}</p>
        <p className="text-sm text-faint">No materials in the catalog.</p>
      </div>
    );
  }

  const needle = filter.trim().toLowerCase();
  const showFilter = materials.length > FILTER_THRESHOLD;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className={`${labelClass} mb-0`}>{label}</p>
        {enteredCount > 0 && (
          <span className="text-sm font-semibold text-teal-800">
            {enteredCount} added
          </span>
        )}
      </div>

      {showFilter && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter materials…"
          aria-label="Filter materials"
          className="mb-2 h-11 w-full rounded-xl border border-field bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-teal-700 focus:bg-teal-300/10 focus:ring-4 focus:ring-teal-700/12"
        />
      )}

      {/* The list scrolls on its own only from `sm` up. On a phone a nested
          scroller inside the sheet fights the sheet's own scrolling, so the
          list runs full height and the page handles it. */}
      <ul className="divide-y divide-line/70 rounded-2xl border border-line/70 sm:max-h-64 sm:overflow-y-auto">
        {materials.map((m) => {
          const value = quantities[m.id] ?? "";
          // A row already carrying a quantity stays put, so a filter can never
          // hide something the user entered.
          const visible =
            !needle || m.name.toLowerCase().includes(needle) || Number(value) > 0;

          return (
            // The `hidden` attribute rather than an unmount: the row keeps its
            // value in the form, and drops out of the accessibility tree too.
            <li key={m.id} hidden={!visible}>
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <label
                  htmlFor={`qty_${m.id}`}
                  className="min-w-0 flex-1 cursor-pointer py-1"
                >
                  <span className="block truncate text-sm font-semibold text-ink">
                    {m.name}
                  </span>
                  <span className="block text-xs text-faint">{m.unit}</span>
                </label>
                <input
                  id={`qty_${m.id}`}
                  name={`qty_${m.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  // Phones show a decimal keypad instead of the full keyboard.
                  inputMode="decimal"
                  placeholder="0"
                  value={value}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [m.id]: e.target.value }))
                  }
                  className={qtyInputClass}
                />
              </div>
            </li>
          );
        })}

        {needle && !materials.some((m) => m.name.toLowerCase().includes(needle)) && (
          <li className="px-3 py-4 text-center text-sm text-faint">
            Nothing matches “{filter.trim()}”.
          </li>
        )}
      </ul>

      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/**
 * What a job already consumed, shown instead of the inputs once usage has been
 * recorded — re-entering it would drain stock and bill the customer twice.
 */
export function MaterialUsageSummary({
  materials,
  label = "Materials used",
  hint,
}: {
  materials: { name: string; unit: string; quantityUsed: number }[];
  label?: string;
  hint?: string;
}) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
        {materials.map((m) => (
          <li
            key={m.name}
            className="flex items-baseline justify-between gap-3 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {m.name}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-muted">
              {m.quantityUsed} {m.unit}
            </span>
          </li>
        ))}
      </ul>
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
