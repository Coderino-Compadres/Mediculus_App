import { describe, expect, it } from 'vitest'
import { formatDelta, formatDeltaSentence, pluralDays } from './reports'

/**
 * What is left of this file after the aggregation moved to `core/reports.py`.
 *
 * The numbers themselves — week grouping, averages, deltas, rankings, the
 * narrative summary — are covered by `backend/core/tests/test_reports_api.py`
 * now, against the code that actually produces them. Deriving them here as well
 * would be testing a second implementation that no longer exists.
 *
 * The wording stays on this side, and so does its test: the API sends a `Delta`
 * as a structure and each surface renders it. `core/report_pdf.py` has its own
 * `format_delta` for the printed version, tested next to it — a card can be
 * hovered over, a printout cannot, so the two say different things on purpose.
 */

describe('formatDelta', () => {
  it('always carries a direction and a value', () => {
    expect(formatDelta({ value: 0.6, gap: null, decimals: 1, unit: '', tone: 'good' })).toBe('+0,6')
    expect(formatDelta({ value: -4, gap: null, decimals: 0, unit: 'dni', tone: 'neutral' })).toBe('−4 dni')
  })

  it('says "bez zmian" rather than "+0,0"', () => {
    expect(formatDelta({ value: 0, gap: null, decimals: 1, unit: '', tone: 'neutral' })).toBe('bez zmian')
  })

  it('distinguishes "no previous week" from "that week never rated this"', () => {
    const first = {
      value: null,
      gap: 'no-previous-week' as const,
      decimals: 1 as const,
      unit: '',
      tone: 'neutral' as const,
    }
    expect(formatDelta(first)).toBeNull()
    expect(formatDeltaSentence(first)).toBe('brak poprzedniego tygodnia do porównania')

    // A week that exists and simply skipped this question must not be reported
    // as a week that does not exist.
    expect(formatDeltaSentence({ ...first, gap: 'unrated' })).toBe(
      'za mało ocen, żeby porównać z poprzednim tygodniem',
    )
  })

  it('uses a comma, not a dot — the whole UI is Polish', () => {
    expect(formatDelta({ value: 1.25, gap: null, decimals: 1, unit: '', tone: 'good' })).toBe('+1,3')
  })
})

describe('Polish plurals', () => {
  it('declines days instead of printing "1 dni"', () => {
    expect(pluralDays(1)).toBe('dzień')
    expect(pluralDays(3)).toBe('dni')
  })
})
