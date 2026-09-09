/**
 * "Aktywność fizyczna" — the vocabulary the activity form writes with.
 *
 * The values are what will travel to the API; the Polish labels are what the
 * screen shows. That is the split `utils/timeOfDay.ts` uses, and the opposite
 * of `utils/emotions.ts`, where the Polish name *is* the stored value. It is
 * the right way round here for "samopoczucie po": three ordered buckets whose
 * wording is a copy decision (the mockup says "Dobre", we say "Lepsze" — see
 * below), and a copy decision must not be a schema change.
 *
 * WHAT THIS MODULE DOES NOT MEASURE. There is no intensity, no effort, no pace,
 * no heart-rate zone and no calorie figure anywhere in this file, and none of
 * them is missing by accident: the module records what somebody chose to write
 * down, not what a device measured. Anything that would need a wearable to
 * answer is out of the project's scope entirely.
 */

/**
 * The activity chips, in the order the mockup draws them.
 *
 * A list rather than a union baked into the component, so extending it is one
 * line here — the mockup's own six are a starting set, not a closed vocabulary,
 * which is also why "Inne" exists next to them.
 *
 * TODO(klientka): confirm the final list. Six plus free text is what §09 shows;
 * a psychodietitian may well want walking and household activity separated, or
 * want the list to differ per patient.
 */
export const ACTIVITY_KINDS = ['Spacer', 'Rower', 'Joga', 'Basen', 'Siłownia', 'Taniec'] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/** The chip that reveals the free-text field, mirroring `OTHER_TRIGGER`. */
export const ACTIVITY_KIND_OTHER = 'Inne'

/**
 * How somebody felt *after* the activity — not how hard it was.
 *
 * The mockup labels the third option "Dobre", which mixes two scales in one
 * row: "Gorsze / Neutralne" compare this activity with how the person felt
 * before it, while "Dobre" judges the state itself. The comparison is the one
 * the question asks ("Samopoczucie po"), so the row is levelled to it and the
 * third option is "Lepsze".
 *
 * The order is deliberate and matches the mockup's design note: the scale
 * starts at "Gorsze" rather than at zero, because for part of this module's
 * patients movement can be a burden, and that answer has to be exactly as easy
 * to give as the positive one.
 */
export const FEELING_AFTER_OPTIONS = [
  { value: 'worse', label: 'Gorsze' },
  { value: 'neutral', label: 'Neutralne' },
  { value: 'better', label: 'Lepsze' },
] as const

export type FeelingAfter = (typeof FEELING_AFTER_OPTIONS)[number]['value']

export const FEELING_AFTER_LABELS: Record<FeelingAfter, string> = Object.fromEntries(
  FEELING_AFTER_OPTIONS.map((option) => [option.value, option.label]),
) as Record<FeelingAfter, string>

/** The label to show, or null when the question went unanswered — which is an
 *  ordinary state here, since no field on this form blocks a save. */
export function feelingAfterLabel(value: FeelingAfter | null | undefined): string | null {
  return value ? FEELING_AFTER_LABELS[value] : null
}

/**
 * The kind of activity one entry recorded, as it should be shown.
 *
 * The chip and the "Inne" free text are two controls but one answer, and they
 * collapse into a single field — so every screen that displays an activity has
 * to unpack them the same way. Exactly the shape of `placeLabel` in
 * `utils/triggers.ts`, which does this for the diary's place chip.
 *
 * null means the question went unanswered: no chip, or "Inne" with nothing
 * typed under it. The row still renders — a walk somebody logged without saying
 * what it was is an entry, not an error.
 */
export function activityKindLabel(kind: string | null, kindOther: string): string | null {
  if (kind === ACTIVITY_KIND_OTHER) return kindOther.trim() || null
  return kind || null
}

/**
 * The step the duration control moves in, in minutes.
 *
 * Five, because the answer is an estimate somebody gives from memory — nobody
 * knows whether their walk was 37 or 40 minutes, and a control that lets them
 * express the difference invites a precision the data does not have.
 */
export const ACTIVITY_DURATION_STEP = 5

/**
 * Where the duration control starts when nothing has been chosen.
 *
 * Not zero: zero minutes of activity is not an activity, so starting there
 * would make the first tap on "+" mean "5 minutes" rather than an adjustment of
 * a plausible answer. Thirty is the mockup's own neighbourhood (it shows 35)
 * and a round number to move away from.
 */
export const ACTIVITY_DURATION_DEFAULT = 30

/**
 * The longest duration the control will reach: a whole day.
 *
 * Not a judgement about how long anybody may move — it is what an entry filed
 * under one day can hold, the same reasoning that bounds the sleep length at
 * 23 h 59 min. Without it a stuck finger on "+" records 40 hours of yoga, and
 * the figure goes into a document a specialist reads.
 */
export const ACTIVITY_DURATION_MAX = 24 * 60

/** "35 min" — the duration as the list and the control both write it. */
export function formatDurationMinutes(minutes: number): string {
  return `${minutes} min`
}
