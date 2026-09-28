/**
 * A specialist's qualification — university, field of study, diploma number —
 * as `core.colleagues.qualifications` sends it.
 *
 * One shape for the three screens that show it (the colleagues roster, the
 * specialist's own profile, the administrator's approval), because the backend
 * sends it from one function and the screens have to agree about what an
 * account created before these were asked for looks like: every value null.
 */
export interface Qualifications {
  university: string | null
  fieldOfStudy: string | null
  diplomaNumber: string | null
}

/** The snake_case keys, each optional: a backend a release behind omits them. */
export interface QualificationsPayload {
  university?: string | null
  field_of_study?: string | null
  diploma_number?: string | null
}

export function toQualifications(payload: QualificationsPayload | null | undefined): Qualifications {
  return {
    university: payload?.university ?? null,
    fieldOfStudy: payload?.field_of_study ?? null,
    diplomaNumber: payload?.diploma_number ?? null,
  }
}

/**
 * "Psychologia, Uniwersytet Rzeszowski · dyplom nr 1234/2015", or null when
 * nothing was recorded — so a row about an older account shows no line at all
 * rather than a line of dashes.
 */
export function qualificationLine(qualifications: Qualifications): string | null {
  const study = [qualifications.fieldOfStudy, qualifications.university]
    .filter(Boolean)
    .join(', ')
  const diploma = qualifications.diplomaNumber ? `dyplom nr ${qualifications.diplomaNumber}` : ''
  return [study, diploma].filter(Boolean).join(' · ') || null
}
