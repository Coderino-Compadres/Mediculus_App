/**
 * How the diet module's week is *written*. It is no longer counted here.
 *
 * **THE ARITHMETIC MOVED TO THE SERVER** (`core/diet_reports.py`), together
 * with the report it produced. What is left is the labelling — the four
 * functions below — plus the one sentence worth keeping in front of whoever
 * reads this file next:
 *
 * **THIS MODULE'S WEEK IS NOT A MONDAY.** The psychotherapy report covers a
 * Monday-to-Sunday week (`core/reports.py` `start_of_week`, mirrored by
 * `startOfWeek` in `utils/days.ts`). The diet module counts seven days from the
 * patient's *first entry*: both of the client's mockup sets say so on the
 * artboard ("Tydzień liczony od pierwszego wpisu… a nie od poniedziałku") and
 * she said it out loud — "jeśli dzienniczki są rozpoczęte od wtorku, to do
 * następnego wtorku". So a diet week that starts on a Tuesday runs Tuesday to
 * Monday, and Monday means nothing here. The two modules disagreeing is
 * deliberate; do not "unify" them.
 *
 * THE ANCHOR IS NOW STORED, which closes the TODO(backend) this file used to
 * carry. It sits on `patient.diet_week_start` (migration 0019), written once
 * and never recomputed. Derived per request — which is what this file did while
 * there was no endpoint — every week boundary, and therefore every week *id*,
 * was a function of whatever history happened to be in hand: one older meal
 * turned 'week-2026-08-27' into 'week-2026-08-26' and renumbered every report
 * the patient had.
 *
 * Everything below is pure and takes its dates as arguments. No `new Date()`
 * inside a function, no clock read at module load — `utils/dayLock.ts` records
 * what this module already got wrong once by freezing a clock and then
 * comparing against it.
 */

import { fromIsoDate } from './days'

export const DAYS_IN_DIET_WEEK = 7

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}

/**
 * '26 sierpnia – 1 września 2026', dropping whatever the two ends share.
 *
 * **The server sends this label ready to render** (`range_label`), built by the
 * same `format_week_range` the psychotherapy reports use, so the two modules
 * print a week identically. This stays as the one place a *test* can state what
 * that label should look like, and as the fallback for anything rendering a
 * range the payload did not carry.
 *
 * Polish month names come out of the locale in the genitive when a day number
 * is asked for alongside them ("1 września"), which is why the month is never
 * formatted on its own here — `{ month: 'long' }` alone gives the nominative
 * ("wrzesień") and "28 wrzesień" is not Polish.
 */
export function dietWeekRangeLabel(start: string, end: string): string {
  const from = fromIsoDate(start)
  const to = fromIsoDate(end)
  const tail = to.toLocaleDateString('pl-PL', DAY_MONTH_YEAR)

  if (from.getFullYear() !== to.getFullYear()) {
    return `${from.toLocaleDateString('pl-PL', DAY_MONTH_YEAR)} – ${tail}`
  }
  if (from.getMonth() !== to.getMonth()) {
    return `${from.toLocaleDateString('pl-PL', DAY_MONTH)} – ${tail}`
  }
  return `${from.getDate()} – ${tail}`
}

/** "wtorek, 1 września" — the heading of one day in the week-by-week listing.
 *
 *  Lowercase weekday and month, as Polish spells them, and deliberately no
 *  `text-transform: capitalize` in the stylesheet: the four sheets that carry
 *  it render "1 września" as "1 Września". */
export function dietDayLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "1.09" — the date on a day chip, where the full label would not fit seven
 *  times across a 390 px screen. Built by hand rather than by the locale, whose
 *  numeric format varies by platform ICU build; a chip is too small a thing to
 *  let render as "01.09.2026" on somebody's phone. */
export function dietShortDayLabel(iso: string): string {
  const date = fromIsoDate(iso)
  return `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * "we wtorek", "w środę" — the weekday the patient's week starts on, with its
 * preposition, ready to drop into the sentence on the list screen.
 *
 * The accusative and the preposition are a table rather than a locale call for
 * the reason `toLocaleDateString` cannot help: it only ever returns the
 * nominative, and "w środa" is not Polish. The preposition alternates too —
 * **"we wtorek"**, because a bare "w" before another "w" is unsayable, while
 * every other day of the seven takes plain "w". Tuesday is the only one that
 * needs it, which is exactly why a single hardcoded "w " would have looked
 * right on six days out of seven.
 *
 * Indexed the way `Date.getDay()` counts, Sunday first. `utils/sleep.ts` holds
 * the same seven accusatives privately for `nightLabel`; extracting one shared
 * table is a small refactor of that file and is out of scope here.
 */
const WEEKDAY_ON = [
  'w niedzielę',
  'w poniedziałek',
  'we wtorek',
  'w środę',
  'w czwartek',
  'w piątek',
  'w sobotę',
] as const

export function dietWeekStartWeekday(iso: string): string {
  return WEEKDAY_ON[fromIsoDate(iso).getDay()]
}
