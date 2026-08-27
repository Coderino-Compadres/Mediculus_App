/**
 * Rendering the numbers a weekly report carries.
 *
 * The aggregation that used to live here moved to `core/reports.py`: deriving
 * reports in the browser meant one document per browser, and the "has this week
 * ended" cutoff was read on the client clock while the dates came from
 * Europe/Warsaw. `api/reports.ts` fetches them now.
 *
 * What stays is presentation, and it stays on this side deliberately: the API
 * sends a `Delta` as a structure — a signed number, a unit, and which of the two
 * reasons a number is missing — so the screen decides how to word it and the PDF
 * (`core/report_pdf.py`, whose `format_delta` is the same three cases) decides
 * separately. A printout cannot be hovered over; a card can.
 */

import type { Delta } from '../types/report'

export const DAYS_IN_WEEK = 7

/** Polish decimal comma, so '3.1' never reaches the screen. */
export function formatNumber(value: number, decimals: 0 | 1): string {
  return value.toFixed(decimals).replace('.', ',')
}

/** Polish plural for a day count: 1 dzień, 3 dni, 7 dni. */
export function pluralDays(count: number): string {
  return count === 1 ? 'dzień' : 'dni'
}

/**
 * A change as a direction and a value, never as a verdict: '+0,6', '−4 dni',
 * 'bez zmian'. null when there is no previous week to compare with.
 *
 * The minus is U+2212, not a hyphen — it lines up with the plus at the same
 * optical weight, which matters when the two sit in a column of cards.
 */
export function formatDelta(delta: Delta): string | null {
  if (delta.value === null) return null
  if (delta.value === 0) return 'bez zmian'
  const sign = delta.value > 0 ? '+' : '−'
  const magnitude = formatNumber(Math.abs(delta.value), delta.decimals)
  return `${sign}${magnitude}${delta.unit ? ` ${delta.unit}` : ''}`
}

/** The same change as a full line for a metric card.
 *
 * A missing number is not one case but two, and they must not share a sentence:
 * "there is no previous week" is false for a week that exists and simply never
 * rated this metric. */
export function formatDeltaSentence(delta: Delta): string {
  const change = formatDelta(delta)
  if (change !== null) return `${change} od poprzedniego tygodnia`
  return delta.gap === 'unrated'
    ? 'za mało ocen, żeby porównać z poprzednim tygodniem'
    : 'brak poprzedniego tygodnia do porównania'
}
