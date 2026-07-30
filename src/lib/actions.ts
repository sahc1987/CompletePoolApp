// Return shape for server actions wired to useFormState/useActionState.
// `null` = untouched, `{ error }` = validation/permission failure to show
// the user, `{ ok: true }` = success (forms can reset / show a confirmation).
export type ActionState = { error?: string; ok?: boolean } | null;
