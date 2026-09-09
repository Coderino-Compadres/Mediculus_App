import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDietReport, fetchDietReports } from './dietReports'

/**
 * The diet reports' mapping layer.
 *
 * The rule worth pinning hardest is that **nothing here composes or recomputes
 * anything**. §10's rows arrive as label-and-sentence pairs already built in
 * Python, because the same sentence has to reach a PDF later and composing
 * Polish in two places is how the two drift. So this layer renames keys and
 * stops — a zero stays a zero, a null stays a null, and the row order is the
 * server's.
 */

const apiRequest = vi.fn()
vi.mock('./client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }))

const ROWS = [
  { key: 'regularity', label: 'REGULARNOŚĆ WPISÓW', value: '6 z 7 dni · 31 posiłków zapisanych' },
  {
    key: 'distribution',
    label: 'ROZKŁAD POSIŁKÓW W CIĄGU DNIA',
    value: 'Najwięcej wpisów o 8:00 i 13:00. 3 posiłki bez godziny.',
  },
]

const REPORT_PAYLOAD = {
  id: 'week-2026-08-01',
  start: '2026-08-01',
  end: '2026-08-07',
  available_from: '2026-08-08',
  week_days: 7,
  meal_count: 31,
  days_with_meals: 6,
  rows: ROWS,
  change_note: 'Więcej dni z wpisem niż w poprzednim tygodniu (6 wobec 4).',
  missing: ['emocje przy jedzeniu', 'sen'],
}

beforeEach(() => {
  apiRequest.mockReset()
})

describe('the history', () => {
  it('maps the week in progress and the ready reports apart', async () => {
    /** Two keys rather than one list with a flag: a week in progress has no
     *  report, and a shape that could carry one would be one branch away from
     *  rendering it as one. */
    apiRequest.mockResolvedValue({
      anchor: '2026-07-11',
      in_progress: {
        start: '2026-08-08',
        end: '2026-08-14',
        closes_on: '2026-08-14',
        meal_count: 12,
        days_with_meals: 4,
      },
      reports: [REPORT_PAYLOAD],
    })

    const summary = await fetchDietReports()

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/reports/')
    expect(summary.anchor).toBe('2026-07-11')
    expect(summary.inProgress).toEqual({
      start: '2026-08-08',
      end: '2026-08-14',
      closesOn: '2026-08-14',
      mealCount: 12,
      daysWithMeals: 4,
    })
    expect(summary.reports).toHaveLength(1)
    expect(summary.reports[0].availableFrom).toBe('2026-08-08')
  })

  it('an empty diary maps to nulls rather than to invented zeros', async () => {
    /** A patient who has written nothing has nothing to report on, and the
     *  screen has to be able to say that rather than draw a week. */
    apiRequest.mockResolvedValue({ anchor: null, in_progress: null, reports: [] })

    await expect(fetchDietReports()).resolves.toEqual({
      anchor: null,
      inProgress: null,
      reports: [],
    })
  })

  it('keeps the server\'s row order', async () => {
    apiRequest.mockResolvedValue({ anchor: '2026-07-11', in_progress: null, reports: [REPORT_PAYLOAD] })

    const [report] = (await fetchDietReports()).reports

    expect(report.rows.map((row) => row.key)).toEqual(['regularity', 'distribution'])
  })

  it('carries a row it does not recognise rather than dropping it', async () => {
    /** The server decides which rows a week has; a whitelist here would mean a
     *  new row silently missing from the document a specialist reads. */
    apiRequest.mockResolvedValue({
      anchor: '2026-07-11',
      in_progress: null,
      reports: [{ ...REPORT_PAYLOAD, rows: [{ key: 'brand-new', label: 'COŚ NOWEGO', value: 'x' }] }],
    })

    const [report] = (await fetchDietReports()).reports

    expect(report.rows).toEqual([{ key: 'brand-new', label: 'COŚ NOWEGO', value: 'x' }])
  })
})

describe('one report', () => {
  it('is read through its own URL, id included', async () => {
    apiRequest.mockResolvedValue(REPORT_PAYLOAD)

    const report = await fetchDietReport('week-2026-08-01')

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/reports/week-2026-08-01/')
    expect(report.id).toBe('week-2026-08-01')
    expect(report.mealCount).toBe(31)
    expect(report.daysWithMeals).toBe(6)
  })

  it('passes a null change note through instead of wording one', async () => {
    /** The first week has nothing to compare with, and "brak zmian" would be a
     *  different claim from "there is no earlier week". */
    apiRequest.mockResolvedValue({ ...REPORT_PAYLOAD, change_note: null })

    expect((await fetchDietReport('week-2026-08-01')).changeNote).toBeNull()
  })

  it('carries the missing sections so the screen can name them', async () => {
    apiRequest.mockResolvedValue(REPORT_PAYLOAD)

    expect((await fetchDietReport('week-2026-08-01')).missing)
      .toEqual(['emocje przy jedzeniu', 'sen'])
  })

  it('maps no value into a figure of its own', async () => {
    /** A zero is a zero: a week with one day and one meal must not be smoothed
     *  into something friendlier. */
    apiRequest.mockResolvedValue({
      ...REPORT_PAYLOAD, meal_count: 1, days_with_meals: 1, rows: [],
    })

    const report = await fetchDietReport('week-2026-08-01')

    expect(report.mealCount).toBe(1)
    expect(report.rows).toEqual([])
  })
})
