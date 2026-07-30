"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "@/components/styles";

type Suggestion = {
  label: string;
  key: string;
};

// Photon (photon.komoot.io) — free, no API key, CORS-enabled geocoder built
// for as-you-type autocomplete. We format its GeoJSON features into a single
// human-readable address line.
const PHOTON_URL = "https://photon.komoot.io/api/";

function formatFeature(f: {
  properties: Record<string, string | undefined>;
}): string {
  const p = f.properties;
  const line1 = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ");
  const parts = [line1, p.city, p.state, p.postcode, p.country].filter(Boolean);
  return parts.join(", ");
}

export default function AddressAutocomplete({
  id,
  name,
  defaultValue = "",
  required,
  placeholder,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  // Guards against a stale slow response overwriting a newer one.
  const seq = useRef(0);

  // Debounced fetch as the user types.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    const mySeq = ++seq.current;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=5`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          features: { properties: Record<string, string | undefined> }[];
        };
        if (mySeq !== seq.current) return; // a newer keystroke won

        const seen = new Set<string>();
        const next: Suggestion[] = [];
        for (const f of data.features ?? []) {
          const label = formatFeature(f);
          if (label && !seen.has(label)) {
            seen.add(label);
            next.push({ label, key: `${label}-${next.length}` });
          }
        }
        setSuggestions(next);
        setActive(-1);
        setOpen(next.length > 0);
      } catch {
        // Aborted or network error — ignore, keep manual typing usable.
      }
    }, 300);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(s: Suggestion) {
    setValue(s.label);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const listId = `${inputId}-listbox`;

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={inputId}
        name={name}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 ? `${listId}-opt-${active}` : undefined
        }
        className={inputClass}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus, avoid blur closing first
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2.5 text-sm ${
                i === active ? "bg-chrome-100 text-navy-900" : "text-ink"
              }`}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
