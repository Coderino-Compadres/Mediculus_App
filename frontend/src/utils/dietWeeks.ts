/**
 * The diet module's week: seven days counted from the patient's first entry.
 *
 * **THIS IS NOT `startOfWeek` FROM utils/days.ts, AND THE DIFFERENCE IS THE
 * POINT.** The psychotherapy module's report covers a Monday-Sunday week — one
 * definition, on the backend (`core/reports.py` `start_of_week`), mirrored by
 * `startOfWeek` here. The diet module counts differently: both of the client's
 * mockup sets say so on the artboard itself ("Tydzień liczony od pierwszego
 * wpisu… a nie od poniedziałku") and she said it out loud — "jeśli dzienniczki
 * są rozpoczęte od wtorku, to do następnego wtorku". So a diet week that starts
 * on a Tuesday runs Tuesday to Monday, and Monday means nothing here.
 *
 * That the two modules disagree about a week is a real inconsistency and it is
 * being raised with the team separately. Nothing in this file touches the
 * psychotherapy half; do not "unify" them by changing that one, because the two
 * answers are both deliberate.
 *
 * **EVERYTHING HERE IS PURE AND TAKES ITS DATES AS ARGUMENTS.** No `new Date()`
 * inside a function, no clock read at module load. That is not a style
 * preference: `utils/dayLock.ts` records what this module already got wrong
 * once — a screen froze "today" at mount, built its data from that same frozen
 * value and then compared the two, so the comparison read `x === x` and could
 * never fire. A week boundary has exactly the same shape (it is a comparison
 * against "now" that has to change while the page is open), so the clock comes
 * from `hooks/useCurrentDay.ts` at the caller and arrives here as a string.
 *
 * Dates are 'YYYY-MM-DD' throughout, which is the format every diet payload
 * already uses and which compares correctly as a string — so "has this week
 * ended" is a `<` between two ISO days rather than arithmetic on two Date
 * objects in a zone nobody named.
 *
 * TODO(backend): **THE ANCHOR HAS TO BE STORED, NOT DERIVED.** `firstEntry`
 * below is an argument and must stay one, but today's only caller computes it
 * per request (`firstEntryDate` in utils/dietReport.ts takes a `min` over the
 * four diaries), and that makes every week boundary — and therefore every week
 * *id* — a function of whatever history happens to be in hand. Deleting the
 * oldest entry, or capping the history the way the psychotherapy module's
 * `MAX_HISTORY_ENTRIES` does, renumbers every report the patient has: a diary
 * anchored on 27 August yields 'week-2026-08-27' and 'week-2026-09-10', and
 * one older meal turns those into 'week-2026-08-26' and 'week-2026-09-09'.
 * Bookmarks break, and once a specialist can open one of these, so does the
 * identity of a document two people are discussing. The psychotherapy module
 * has no such problem because Monday is not derived from anything.
 *
 * So the anchor belongs on the patient's own row — a `diet_week_start` column
 * written once, when the first entry is saved, and never recomputed — and
 * `/api/diet/reports/` should pass it in here. Keeping it a parameter is what
 * makes that a one-line change at the caller instead of a rewrite of this
 * file.
 */

import { addDays, fromIsoDate, toIsoDate } from './days'

export const DAYS_IN_DIET_WEEK = 7

/** One week of the diet diary: seven days, both ends inclusive. */
export interface DietWeek {
  /** 'week-2026-09-01' — the route param, keyed on the week's *first* day. */
  id: string
  /** 'YYYY-MM-DD', the first day. Rarely a Monday; see the file header. */
  start: string
  /** 'YYYY-MM-DD', `start` + 6. */
  end: string
}

/** The id convention is the psychotherapy module's, deliberately: one shape of
 *  week id in the app, even though the two modules disagree about which seven
 *  days it names. */
export function dietWeekId(start: string): string {
  return `week-${start}`
}

/* There is deliberately no inverse of `dietWeekId` — no function turning a
   route id back into a date. One existed, was exported and tested, and had no
   caller: the detail screen hands the id straight to `findDietReport`, which
   answers null for an id no week carries, and that is the same answer the
   screen owes a malformed address. Parsing the id first would let the two
   cases be told apart, which is precisely what both screens decline to do. */

function weekFrom(start: string): DietWeek {
  return {
    id: dietWeekId(start),
    start,
    end: toIsoDate(addDays(fromIsoDate(start), DAYS_IN_DIET_WEEK - 1)),
  }
}

/**
 * Every week that has *ended*, newest first.
 *
 * **THE WEEK IN PROGRESS IS LEFT OUT, AND THAT IS A DEPARTURE FROM BOTH
 * MOCKUPS.** Each of them draws the running week at the top of the list as a
 * card labelled "W TOKU" / "TRWA". It is left out here for two reasons taken
 * together: the psychotherapy module already defines a report as something that
 * exists once its week has ended (`build_weekly_reports` filters exactly this
 * way), and the client asked for reports rather than for a live view of the
 * current week. Two modules disagreeing about whether a report can describe an
 * unfinished week would be a difference a patient crossing between them reads
 * as a fault. If she asks for the running week back, this is the one function
 * that changes.
 *
 * A week has ended when `today` has moved past its last day — `end < today`, so
 * a week whose last day *is* today is still running and closes at midnight.
 * That boundary is why `today` is an argument: the list has to grow while the
 * page is open, without a reload.
 *
 * An empty result is the ordinary state of a diary younger than a week, and a
 * `firstEntry` in the future (a clock somebody set forward) yields one too
 * rather than looping.
 */
export function completedDietWeeks(firstEntry: string | null, today: string): DietWeek[] {
  if (!firstEntry) return []

  const weeks: DietWeek[] = []
  let start = firstEntry

  while (true) {
    const week = weekFrom(start)
    if (week.end >= today) break
    weeks.push(week)
    start = toIsoDate(addDays(fromIsoDate(start), DAYS_IN_DIET_WEEK))
  }

  return weeks.reverse()
}

/** The week's seven days as ISO strings, **in the week's own order** — starting
 *  at `start`, which is where the chips and the day-by-day list start too. */
export function dietWeekDays(week: DietWeek): string[] {
  const first = fromIsoDate(week.start)
  return Array.from({ length: DAYS_IN_DIET_WEEK }, (_, offset) =>
    toIsoDate(addDays(first, offset)),
  )
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}

/**
 * '26 sierpnia – 1 września 2026', dropping whatever the two ends share.
 *
 * The same three cases `format_week_range` in `core/reports.py` handles, and
 * the same en dash, so the two modules at least *print* a week the same way.
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
