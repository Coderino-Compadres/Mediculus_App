/**
 * Wording for the specialist panel.
 *
 * A pure-function module like utils/children.ts, and for the same reason: the
 * phrasing on these screens is the part most worth testing and the part that
 * needs no screen to test. It also keeps the caseload card, the reports header
 * and the guardian-code form naming one patient the same way — three screens
 * calling the same person three things would be worse than any one of them.
 */

/**
 * How a patient is named on the panel: full name, then address, then a neutral
 * fallback.
 *
 * The fallback matters more here than it looks: a specialist with several
 * patients cannot act on an unnamed row, and a row *is* possible with neither
 * name nor address — `user.name`, `surname` and `email` are all nullable in this
 * schema. Mirrors `childLabel` in utils/children.ts.
 */
export function patientLabel(patient: {
  name: string | null
  surname: string | null
  email: string | null
}): string {
  const name = [patient.name?.trim(), patient.surname?.trim()].filter(Boolean).join(' ')
  return name || patient.email?.trim() || 'Konto pacjenta'
}
