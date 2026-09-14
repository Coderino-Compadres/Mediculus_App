import { describe, expect, it } from 'vitest'
import {
  DAYS_IN_DIET_WEEK,
  dietDayLabel,
  dietShortDayLabel,
  dietWeekRangeLabel,
  dietWeekStartWeekday,
} from './dietWeeks'

/**
 * How the diet module's week is *written*. It is no longer counted here.
 *
 * **THE ARITHMETIC MOVED TO THE SERVER** (`core/diet_reports.py`), and so did
 * the suites that used to sit at the top of this file: seven days from the
 * first entry rather than from a Monday, a week closing at midnight and not
 * before, the week in progress being left out, and the two daylight-saving
 * fortnights. `backend/core/tests/test_diet_reports_api.WeekTests` covers the
 * first three, and the fourth stopped being a question at all — Python counts
 * with `datetime.date` arithmetic, which has no clock to go back or forward.
 *
 * WHAT THE MOVE DID NOT CHANGE is the rule those tests existed to protect, and
 * it is worth restating where somebody will read it: **this module's week is
 * not a Monday.** Seven days from the patient's first entry, so a diary started
 * on a Wednesday has Wednesday-to-Tuesday weeks. Both of the client's mockup
 * sets say so on the artboard and she said it in the meeting; `core/reports.py`
 * says the opposite about its own module, on purpose.
 *
 * What a payload cannot carry is a Polish label, so that is what is left.
 */

describe('the week length', () => {
  it('is seven days, which is what every label below assumes', () => {
    expect(DAYS_IN_DIET_WEEK).toBe(7)
  })
})

describe('dietWeekRangeLabel', () => {
  it('drops whatever the two ends share', () => {
    expect(dietWeekRangeLabel('2026-09-02', '2026-09-08')).toBe('2 – 8 września 2026')
    expect(dietWeekRangeLabel('2026-08-26', '2026-09-01')).toBe('26 sierpnia – 1 września 2026')
    expect(dietWeekRangeLabel('2026-12-30', '2027-01-05')).toBe(
      '30 grudnia 2026 – 5 stycznia 2027',
    )
  })

  it('spells the month in the genitive, which is what Polish needs', () => {
    /** The month is never formatted on its own: `{ month: 'long' }` alone gives
     *  the nominative and "28 wrzesień" is not Polish. */
    expect(dietWeekRangeLabel('2026-09-02', '2026-09-08')).not.toMatch(/wrzesień/)
  })
})

describe('the day labels', () => {
  it('names a day with its weekday, lowercase as Polish spells it', () => {
    expect(dietDayLabel('2026-09-02')).toBe('środa, 2 września')
  })

  it('shortens a chip to day and month, padded so seven of them line up', () => {
    expect(dietShortDayLabel('2026-09-02')).toBe('2.09')
    expect(dietShortDayLabel('2026-12-30')).toBe('30.12')
  })
})

describe('dietWeekStartWeekday', () => {
  it('carries the preposition, and alternates it where Polish does', () => {
    /** "we wtorek" is the one of the seven that needs "we" — a bare "w" would
     *  have looked right on the other six. */
    expect(dietWeekStartWeekday('2026-09-01')).toBe('we wtorek')
    expect(dietWeekStartWeekday('2026-09-02')).toBe('w środę')
    expect(dietWeekStartWeekday('2026-08-03')).toBe('w poniedziałek')
  })
})
