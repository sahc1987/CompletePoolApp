// Shared Tailwind class strings so every form/table/card looks the same
// across the app. Plain constants (no "use client") so both server and
// client components can import them.

// Fields: tall, generously rounded, near-invisible resting border, and a soft
// tinted fill when active — matching the reference design.
// `border-field` (3.39:1) instead of a near-invisible hairline: a field's
// edge has to be findable outdoors, not just implied.
export const inputClass =
  "w-full rounded-2xl border border-field bg-white px-4 py-3.5 text-ink outline-none transition placeholder:text-faint hover:border-teal-700 hover:bg-teal-300/10 focus:border-teal-700 focus:bg-teal-300/10 focus:ring-4 focus:ring-teal-700/12 disabled:cursor-not-allowed disabled:bg-surface disabled:text-faint";

// Selects reuse the input look plus a custom chevron (see .form-select).
export const selectClass = `${inputClass} form-select cursor-pointer`;

// Labels: bold and dark navy, sitting above the field.
export const labelClass = "mb-2 block text-[15px] font-bold text-navy-900";

// Teal pill = the primary call-to-action, echoing the reference hero's
// "Start Your Project" button. A subtle vertical sheen gives it depth without
// pushing the light end above white text's contrast floor.
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-teal-700 to-teal-800 px-5 py-2.5 font-bold text-white shadow-sm transition hover:from-teal-800 hover:to-teal-900 hover:shadow-md active:scale-[.98] disabled:opacity-60";

// Solid royal-blue pill = a primary in-app action (save, schedule, etc.).
export const btnBlue =
  "inline-flex items-center justify-center gap-2 rounded-full bg-navy-700 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-navy-500 hover:shadow-md active:scale-[.98] disabled:opacity-60";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 font-semibold text-ink shadow-sm transition hover:border-navy-500/40 hover:bg-chrome-100 active:scale-[.98] disabled:opacity-60";

export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-full border border-danger/30 bg-white px-4 py-1.5 text-sm font-semibold text-danger transition hover:bg-danger/10 active:scale-[.98] disabled:opacity-60";

export const card =
  "rounded-2xl border border-line/80 bg-white p-6 shadow-card";
