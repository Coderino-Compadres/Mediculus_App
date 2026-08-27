/**
 * Role names as a person should read them.
 *
 * `user.role` is the row's own name from `user_role` — 'patient', 'rodzic',
 * 'specjalista' — and the header menu was printing it straight, so a Polish UI
 * greeted a patient with the word "patient". The registration form already had
 * these words (`ACCOUNT_TYPE_OPTIONS` in pages/Register.tsx); this is the same
 * vocabulary for the direction the API answers in.
 *
 * A name with no entry falls through unchanged rather than being hidden: a role
 * added on the backend should look unfinished here, not disappear.
 */
const ROLE_LABELS: Record<string, string> = {
  patient: 'Pacjent',
  rodzic: 'Rodzic lub opiekun',
  specjalista: 'Specjalista',
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}
