/**
 * Calendar-day arithmetic in the browser's local zone — the frontend half of
 * `core/days.py`, which does the same in `settings.TIME_ZONE`.
 *
 * Everything here works on local midnight rather than UTC instants, because
 * every day-shaped rule in the app is about the calendar ("today's entry", "the
 * week this entry belongs to"), not about a 24-hour window.
 */

/** 'YYYY-MM-DD' for the local calendar day — the key the API's `date` fields use. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** The reverse: local midnight of a 'YYYY-MM-DD' string.
 *
 * The explicit time matters — `new Date('2026-08-03')` is parsed as UTC
 * midnight, which lands on the previous day west of Greenwich.
 */
export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/**
 * The two-letter weekday labels, indexed by `Date.getDay()` (Sunday first) —
 * one set for every chart and chip in the app. §08 of the mockups writes
 * Pn, Nd and Sb. There used to be three: "Pon/Czw/Ndz" on the home screen,
 * "So" in the analysis and "Sb" in the diet module, side by side in one app.
 */
export const WEEKDAY_SHORT_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'] as const

/** "Pn", "Wt" … for an ISO date, read as the local calendar day. */
export function weekdayShortLabel(iso: string): string {
  const date = fromIsoDate(iso)
  return Number.isNaN(date.getTime()) ? iso : WEEKDAY_SHORT_LABELS[date.getDay()]
}

/**
 * Whether a string names a real calendar day — the guard for an ISO date that
 * came out of a URL rather than out of the API.
 *
 * Both halves are needed. The pattern alone accepts '2026-13-45'; `Date` alone
 * accepts it too, by rolling it over into 2027. So the day is parsed and then
 * written back out, and the two spellings have to match: a date that rolled
 * over comes back as a different string and is refused.
 *
 * Why a screen cares: the day endpoint answers 404 both for a day with no meals
 * and for a date that could never have had any, so without this the two read
 * identically and a typo in the address bar says "you wrote nothing that day".
 */
export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const parsed = fromIsoDate(iso)
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === iso
}

/** Local midnight `days` away from `date`; `days` may be negative. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** The Monday of the week `date` falls in, at local midnight.
 *
 * Monday-first because that is the Polish week, and because a Monday-Sunday
 * report is what "raz na tydzień" means to somebody whose visit is on a Monday.
 */
export function startOfWeek(date: Date): Date {
  // getDay() is Sunday-first (0 = Sunday), so shift it to Monday-first.
  const weekday = (date.getDay() + 6) % 7
  return addDays(date, -weekday)
}
