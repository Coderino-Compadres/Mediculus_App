/**
 * "Sen" — the night's vocabulary, and the one arithmetic this module performs.
 *
 * WHICH NIGHT AN ENTRY DESCRIBES. A sleep entry belongs to the night that
 * *ended* on the morning of its `date`: filled in on Friday morning, it
 * describes the night from Thursday to Friday, and its `date` is Friday. The
 * rule has to be written down somewhere because nothing about the data says it
 * — a row holding 23:40 and 06:50 is equally readable as Thursday's night or
 * Friday's, and the two answers put it in different weeks. It is stated once
 * here and once in `types/diet.ts`, next to the field itself.
 *
 * That choice follows from how the screen is used rather than from taste: the
 * form is filled in after waking, so the day the patient is looking at is the
 * day the entry lands on. It also keeps the module's one calendar rule intact —
 * `date` is always the local calendar day the patient is in, exactly as
 * `utils/days.ts` computes it and `core/days.py` mirrors it.
 *
 * WHAT IS COMPUTED HERE, AND NOTHING ELSE. `sleepDurationMinutes` is the only
 * derived value in the whole diet module. There is no sleep score, no average,
 * no comparison with other nights and no reading of how sleep relates to meals
 * or to mood — that last one is the analysis screen's job and a specialist's
 * conclusion, not a card's.
 */

import { addDays } from './days'

/**
 * How the night felt on waking.
 *
 * The mockup writes these as adjectives agreeing with a female patient
 * ("Wyspana", "Ociężale", "Spokojnie", "Z napięciem" — itself a mix of
 * adjectives and adverbs). Nouns instead: they name the same four states, read
 * identically to everybody, and put the row in one grammatical shape.
 */
export const WAKE_FEELING_OPTIONS = [
  { value: 'rested', label: 'Wyspanie' },
  { value: 'heavy', label: 'Ociężałość' },
  { value: 'calm', label: 'Spokój' },
  { value: 'tense', label: 'Napięcie' },
] as const

export type WakeFeeling = (typeof WAKE_FEELING_OPTIONS)[number]['value']

export const WAKE_FEELING_LABELS: Record<WakeFeeling, string> = Object.fromEntries(
  WAKE_FEELING_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WakeFeeling, string>

/** The label to show, or null when the question went unanswered. */
export function wakeFeelingLabel(value: WakeFeeling | null | undefined): string | null {
  return value ? WAKE_FEELING_LABELS[value] : null
}

/**
 * The sleep-quality scale, 1 to 5.
 *
 * Numbers rather than named grades, which is what the mockup's detailed variant
 * draws. The alternative in the other variant ("Bardzo zła … Bardzo dobra")
 * asks the patient to judge their night in words; a number is the lighter
 * question, and this module's premise is that it describes rather than grades.
 */
export const SLEEP_QUALITY_VALUES = [1, 2, 3, 4, 5] as const

export type SleepQuality = (typeof SLEEP_QUALITY_VALUES)[number]

export function isSleepQuality(value: number): value is SleepQuality {
  return (SLEEP_QUALITY_VALUES as readonly number[]).includes(value)
}

const MINUTES_IN_DAY = 24 * 60

/**
 * What counts as a length of sleep: from one minute to 23 h 59 min.
 *
 * The ceiling is not a judgement about how long anybody may sleep — it is what
 * the two hours can express. A night is measured as the distance from one clock
 * reading forwards to the next, so every honest pair lands inside this range and
 * exactly one pair falls outside it: two identical hours, which measure a full
 * turn of the clock. That is a slip of the finger rather than a day-long sleep,
 * so it is answered with a request to correct it instead of a figure.
 */
export const MIN_SLEEP_MINUTES = 1
export const MAX_SLEEP_MINUTES = 23 * 60 + 59

/** 'HH:MM' → minutes since local midnight, or null for anything that is not one. */
function minutesSinceMidnight(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * How long the night lasted, in minutes — the module's only computed value.
 *
 * THE NIGHT CROSSES MIDNIGHT, which is the whole reason this is a function and
 * not a subtraction at the call site: 23:40 → 06:50 is 7 h 10 min, and the
 * subtraction on its own gives −16 h 50 min. Anything that does not run
 * strictly forwards within one day is read as having crossed midnight and gets
 * a day added.
 *
 * null when either hour is missing or unreadable — both fields are optional, so
 * "no length yet" is an ordinary state rather than a failure. The screen leaves
 * the figure out rather than printing a zero, for the same reason the diary
 * treats an untouched slider as unanswered instead of as nought.
 *
 * Also null when the result falls outside [MIN_SLEEP_MINUTES, MAX_SLEEP_MINUTES],
 * which in practice means two identical hours: 23:00 → 23:00 measures a full
 * turn of the clock, and a day-long sleep is a far less likely reading of it than
 * a mistyped digit. The screen answers that with a quiet request to correct one
 * of the hours (`sleepHoursCollide` is how it tells that case apart from a night
 * nobody has described yet) and still lets the entry be saved — no field in this
 * module blocks a save. The length simply is not computed.
 */
export function sleepDurationMinutes(
  fellAsleepAt: string | null,
  wokeUpAt: string | null,
): number | null {
  if (!fellAsleepAt || !wokeUpAt) return null
  const start = minutesSinceMidnight(fellAsleepAt)
  const end = minutesSinceMidnight(wokeUpAt)
  if (start === null || end === null) return null
  const forward = end - start
  const minutes = forward > 0 ? forward : forward + MINUTES_IN_DAY
  if (minutes < MIN_SLEEP_MINUTES || minutes > MAX_SLEEP_MINUTES) return null
  return minutes
}

/**
 * Whether the two hours are the same reading — the one pair that is answered
 * with a correction rather than with a figure.
 *
 * Kept apart from `sleepDurationMinutes` returning null because the screen has
 * to word two silences differently: a night nobody has filled in yet is waiting
 * for an answer, while this one has been answered in a way that cannot be
 * measured. Saying "policzy się, kiedy będą obie godziny" over two hours that
 * are both plainly there would read as the screen failing to notice them.
 */
export function sleepHoursCollide(
  fellAsleepAt: string | null,
  wokeUpAt: string | null,
): boolean {
  if (!fellAsleepAt || !wokeUpAt) return false
  const start = minutesSinceMidnight(fellAsleepAt)
  const end = minutesSinceMidnight(wokeUpAt)
  if (start === null || end === null) return false
  return start === end
}

/**
 * "7 h 10 min" — the mockup's own formatting.
 *
 * A whole number of hours drops the minutes ("7 h" rather than "7 h 0 min") and
 * a night under an hour drops the hours, because a unit showing nothing but a
 * zero reads as a field that failed to fill in.
 */
export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}

/**
 * The first half of the label — the day the night began on, in the genitive and
 * *with its preposition*. Indexed the way `Date.getDay()` counts, Sunday first.
 *
 * Written out rather than taken from `toLocaleDateString`, which only ever
 * returns the nominative ("środa"): "noc z środa na czwartek" is not Polish.
 *
 * The preposition is part of the table rather than a literal at the call site
 * because Polish alternates it: "z" everywhere, but **"ze" before "środy"**,
 * where a bare "z" would collide with the ś. Wednesday is the only day of the
 * seven that needs it, which is exactly why a single hardcoded "z " would have
 * looked right in six tests out of seven.
 */
const WEEKDAY_NIGHT_FROM = [
  'z niedzieli',
  'z poniedziałku',
  'z wtorku',
  'ze środy',
  'z czwartku',
  'z piątku',
  'z soboty',
] as const

const WEEKDAY_ACCUSATIVE = [
  'niedzielę',
  'poniedziałek',
  'wtorek',
  'środę',
  'czwartek',
  'piątek',
  'sobotę',
] as const

/**
 * "noc z czwartku na piątek" — which night the entry on screen describes.
 *
 * Takes the morning the night ended on, i.e. the entry's own `date` as a Date,
 * and names the day before it and that day. See the note at the top of this
 * file for why the entry belongs to the later of the two.
 */
export function nightLabel(morning: Date): string {
  const evening = addDays(morning, -1)
  return `noc ${WEEKDAY_NIGHT_FROM[evening.getDay()]} na ${WEEKDAY_ACCUSATIVE[morning.getDay()]}`
}
