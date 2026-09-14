/**
 * Readers used by the server-action adapters to turn a `FormData` into a
 * service input.
 *
 * `FormData.get` returns `string | File | null`, which is the browser's
 * business and not something a contract schema should have to model. These
 * collapse it to the two shapes the schemas actually accept, so the adapters
 * stay one-liners and no `as` casts leak into them.
 */

/** A required text field. Missing becomes `""`, which fails validation with the schema's own message. */
export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** An optional text field. Missing or blank becomes `undefined`. */
export function opt(formData: FormData, key: string): string | undefined {
  const v = str(formData, key).trim();
  return v === "" ? undefined : v;
}

/** An HTML checkbox: absent when unchecked, `"on"` when checked. */
export function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** Every value for a repeated field (multi-select, checkbox group). */
export function many(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}
