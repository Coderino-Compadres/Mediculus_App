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

/**
 * `Object.hasOwn`, not a bare lookup: the map is a plain object, so a role named
 * 'toString' answered with `Object.prototype.toString` — a *function* where the
 * header expects a word, which React renders as nothing at all. The same trap is
 * guarded the same way in `isTimeOfDay` (utils/timeOfDay.ts).
 */
export function roleLabel(role: string): string {
  return Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role] : role
}
