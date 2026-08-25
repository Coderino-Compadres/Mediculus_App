/**
 * Suggested place/trigger chips for "Sytuacja i reakcja". The client asked for
 * roughly 10 typical options plus a free-text "Inne" — this list is a reasonable
 * starting set, not a final one.
 *
 * TODO: confirm the final, definitive list with the client before this ships.
 */
export const TRIGGER_OPTIONS = [
  'Dom',
  'Praca',
  'Uczelnia',
  'Szkoła',
  'Transport',
  'Wśród ludzi',
  'Internet/social media',
  'Sam/sama w domu',
  'Podczas snu/przed snem',
  'Inne',
] as const

export type TriggerOption = (typeof TRIGGER_OPTIONS)[number]

export const OTHER_TRIGGER: TriggerOption = 'Inne'
