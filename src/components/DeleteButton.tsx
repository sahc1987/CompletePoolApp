"use client";

import { btnDanger } from "./styles";

// Small client wrapper so a server action can be triggered by a button with
// a native confirm() guard. Server actions are passed in as props (they're
// serializable references), keeping the mutation logic on the server.
export default function DeleteButton({
  action,
  hidden,
  confirm,
  label,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  confirm: string;
  label: string;
  // Override the default pill for quieter contexts (e.g. dense tables).
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className ?? btnDanger}>
        {label}
      </button>
    </form>
  );
}
