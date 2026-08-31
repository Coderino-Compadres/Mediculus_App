/**
 * "Pora dnia" — when the situation an entry describes actually happened.
 *
 * Deliberately not the moment the entry was written: that is `savedAt` (the
 * row's `updated_at`), and a patient can perfectly well describe a morning
 * episode in the evening. The two answer different questions, and the analysis
 * screen needs this one — so it has to be a field the patient fills in, not a
 * timestamp the server takes.
 *
 * Four buckets rather than a clock reading, because the question is asked in
 * passing on a form whose whole point is being quick to fill in.
 *
 * The values are what travels to the API; the labels are what every screen
 * shows. They live here rather than in the form so the archive and the analysis
 * screen word them identically — the same split as utils/emotions.ts and
 * utils/triggers.ts.
 */

export const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Rano' },
  { value: 'noon', label: 'Południe' },
  { value: 'evening', label: 'Wieczór' },
  { value: 'night', label: 'Noc' },
] as const

export type TimeOfDay = (typeof TIME_OF_DAY_OPTIONS)[number]['value']

/** Chronological, so a chip row and any grouped chart read in the same order. */
export const TIME_OF_DAY_VALUES: readonly TimeOfDay[] = TIME_OF_DAY_OPTIONS.map(
  (option) => option.value,
)

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = Object.fromEntries(
  TIME_OF_DAY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<TimeOfDay, string>

/** True only for one of the four values — used to guard what the API sends back.
 *
 * `Object.hasOwn`, not `in`: the labels object is a plain object, so `in` would
 * also answer true for 'toString' and everything else off Object.prototype. */
export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === 'string' && Object.hasOwn(TIME_OF_DAY_LABELS, value)
}

/**
 * The label to display, or null when the entry did not answer the question.
 *
 * The field is optional on the form, so "not answered" is a normal state and
 * every screen showing it has to leave the line out rather than print a dash.
 */
export function timeOfDayLabel(value: TimeOfDay | null | undefined): string | null {
  return value ? TIME_OF_DAY_LABELS[value] : null
}
