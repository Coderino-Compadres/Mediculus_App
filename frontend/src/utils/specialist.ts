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

/**
 * How a specialist is named in the roster of professional accounts.
 *
 * The same shape as `patientLabel` and for the same reason — every name column
 * in this schema is nullable, so a row with neither a name nor an address is
 * possible and still has to be readable. The fallback differs only in what kind
 * of account it is describing.
 */
export function colleagueLabel(colleague: {
  name: string | null
  surname: string | null
  email: string | null
}): string {
  const name = [colleague.name?.trim(), colleague.surname?.trim()].filter(Boolean).join(' ')
  return name || colleague.email?.trim() || 'Konto specjalisty'
}
