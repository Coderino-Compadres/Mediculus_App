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
