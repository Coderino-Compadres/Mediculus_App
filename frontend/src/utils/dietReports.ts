/**
 * How the diet module names one report's week.
 *
 * Its own file rather than an export from `pages/DietReports.tsx`, because both
 * report screens render the same range — the history in a row, the detail at the
 * top of the document — and a week named two ways on two screens is a week the
 * patient has to reconcile themselves. (It lived on the list screen first, which
 * also made that file export a non-component and cost a lint warning; the rule
 * is right about the reason.)
 *
 * §10's own form: "1 – 7 sierpnia", "28 lipca – 3 sierpnia". An en dash with
 * spaces, the month named once when both ends share it, and the year only when
 * the range is not in the current one — a report from this year should not be
 * labelled with it, and one from last year must be.
 *
 * Every date is parsed as a LOCAL day (`fromIsoDate`), never with
 * `new Date(iso)`: that is UTC midnight, which west of Warsaw is the day before
 * — the same class of bug that moved the weekly report's cutoff to the backend.
 */

import { fromIsoDate } from './days'

/** "1 sierpnia" — the month lowercase, as Polish spells one, and in the genitive
 *  form it takes beside a day number, which is what Intl returns for the pair
 *  (`{ month: 'long' }` alone would give the nominative "sierpień"). */
/** "8 sierpnia" — a day and its month, lowercase as Polish spells one. */
export function dayMonthLabel(date: Date): string {
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
}

/**
 * "1 – 7 sierpnia", "28 lipca – 3 sierpnia" — one week as the artboard writes it.
 *
 * The month is named once when both ends share it and twice when they do not,
 * and the year appears only when the range is not in the current one: a report
 * from this year should not be labelled with it, and one from last year must be.
 *
 * Exported because `DietReportDetail` renders the same range at the top of the
 * document — a week named two ways on two screens is a week the patient has to
 * match up by hand. `today` is a parameter rather than read inside, so the
 * year-boundary cases can be tested without moving the clock.
 */
export function weekRangeLabel(start: string, end: string, today: Date = new Date()): string {
  const from = fromIsoDate(start)
  const to = fromIsoDate(end)
  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()
  const yearNeeded =
    from.getFullYear() !== today.getFullYear() || to.getFullYear() !== today.getFullYear()

  if (sameMonth) {
    const label = `${from.getDate()} – ${dayMonthLabel(to)}`
    return yearNeeded ? `${label} ${to.getFullYear()}` : label
  }

  // A week that straddles New Year needs the year on both ends; one that only
  // straddles a month needs it once, after the second date.
  const left =
    yearNeeded && from.getFullYear() !== to.getFullYear()
      ? `${dayMonthLabel(from)} ${from.getFullYear()}`
      : dayMonthLabel(from)
  const right = yearNeeded ? `${dayMonthLabel(to)} ${to.getFullYear()}` : dayMonthLabel(to)
  return `${left} – ${right}`
}
