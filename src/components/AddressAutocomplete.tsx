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
// Wait for a pause in typing, and don't search for fragments: the free service
// rate-limits, and most of what is typed on the way to an address is noise.
const PAUSE_MS = 700;
const MIN_CHARS = 5;

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
  // True once the text is a picked suggestion (or the saved address, untouched).
  const [verified, setVerified] = useState(defaultValue.trim() !== "");
  const [status, setStatus] = useState<"idle" | "none" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Suggestion[]>());

  const wrapRef = useRef<HTMLDivElement>(null);
  // Guards against a stale slow response overwriting a newer one.
  const seq = useRef(0);

  // Debounced fetch as the user types.
  useEffect(() => {
    const q = value.trim();
    setStatus("idle");
    // A picked address needs no more lookups (choosing used to trigger one).
    if (verified || q.length < MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    const hit = cache.current.get(q.toLowerCase());
    if (hit) {
      setSuggestions(hit);
      setOpen(hit.length > 0);
      setStatus(hit.length === 0 ? "none" : "idle");
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
        cache.current.set(q.toLowerCase(), next);
        setSuggestions(next);
        setActive(-1);
        setOpen(next.length > 0);
        setStatus(next.length === 0 ? "none" : "idle");
      } catch (e) {
        // Aborted by a newer keystroke: ignore. Anything else means the lookup
        // service is down, so don't block saving on it.
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, PAUSE_MS);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value, verified]);

  // Native form validation blocks the submit until the address is confirmed.
  useEffect(() => {
    const ok = verified || status === "error" || value.trim() === "";
    inputRef.current?.setCustomValidity(
      ok ? "" : "Pick an address from the suggestions, or choose “Use as typed”."
    );
  }, [verified, status, value]);

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
    setVerified(true);
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
        ref={inputRef}
        onChange={(e) => {
          setValue(e.target.value);
          setVerified(false);
        }}
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

      {!verified && status === "none" && (
        <p className="mt-1.5 text-sm text-muted">
          No match found. Check the spelling, or{" "}
          <button
            type="button"
            onClick={() => setVerified(true)}
            className="font-semibold text-navy-700 hover:underline"
          >
            use as typed
          </button>
          .
        </p>
      )}
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
