import { describe, expect, it } from 'vitest'
import {
  completedDietWeeks,
  dietDayLabel,
  dietShortDayLabel,
  dietWeekDays,
  dietWeekId,
  dietWeekRangeLabel,
  dietWeekStartWeekday,
} from './dietWeeks'
import { fromIsoDate } from './days'

/**
 * The diet module's week, which is not the psychotherapy module's.
 *
 * WHAT IS PINNED HERE IS THE DIFFERENCE. Seven days from the patient's first
 * entry, so a diary started on a Wednesday has Wednesday-to-Tuesday weeks and
 * Monday means nothing at all. Both of the client's mockup sets say so on the
 * artboard and she said it in the meeting; `core/reports.py` says the opposite
 * about its own module, on purpose. A test is the only thing that will notice
 * if somebody "fixes" this file by reaching for `startOfWeek`.
 *
 * THE SECOND THING PINNED IS THAT A WEEK CLOSES AT MIDNIGHT AND NOT BEFORE,
 * asked with two different "todays" rather than one. That shape is deliberate:
 * `utils/dayLock.ts` records the defect this module already shipped, where a
 * day comparison was fed the same frozen value on both sides, read `x === x`
 * and could never fire — and its tests passed, because they only ever asked it
 * once.
 */

/** A Wednesday, chosen because nothing about it is a Monday. */
const FIRST_ENTRY = '2026-08-26'

describe('completedDietWeeks', () => {
  it('counts seven days from the first entry, not from a Monday', () => {
    const weeks = completedDietWeeks(FIRST_ENTRY, '2026-09-20')

    // Newest first, and every one of them runs Wednesday to Tuesday.
    expect(weeks.map((week) => [week.start, week.end])).toEqual([
      ['2026-09-09', '2026-09-15'],
      ['2026-09-02', '2026-09-08'],
      ['2026-08-26', '2026-09-01'],
    ])
    for (const week of weeks) {
      expect(fromIsoDate(week.start).getDay()).toBe(3)
      expect(fromIsoDate(week.end).getDay()).toBe(2)
    }
  })

  it('starts no week on a Monday just because one went past', () => {
    /** 31 August 2026 is a Monday and falls inside the first week. If anything
     *  here ever reached for `startOfWeek`, it would become a boundary. */
    const starts = completedDietWeeks(FIRST_ENTRY, '2026-09-20').map((week) => week.start)

    expect(starts).not.toContain('2026-08-31')
  })

  it('leaves a week running until midnight has passed', () => {
    /** The first week's last day is Tuesday 1 September. Asked *on* that day
     *  it is still in progress; asked the next morning it is a report. Two
     *  calls, because one frozen clock is what made the day lock a no-op. */
    expect(completedDietWeeks(FIRST_ENTRY, '2026-09-01')).toEqual([])

    const nextMorning = completedDietWeeks(FIRST_ENTRY, '2026-09-02')

    expect(nextMorning).toHaveLength(1)
    expect(nextMorning[0].end).toBe('2026-09-01')
  })

  it('never includes the week in progress', () => {
    /** Mid-week: the running week (9-15 September) is absent while the two
     *  behind it are there. This is the departure from both mockups, which
     *  draw a "W TOKU" card at the top of the list. */
    const weeks = completedDietWeeks(FIRST_ENTRY, '2026-09-11')

    expect(weeks.map((week) => week.start)).toEqual(['2026-09-02', '2026-08-26'])
  })

  it('answers with nothing for a diary younger than a week', () => {
    expect(completedDietWeeks(FIRST_ENTRY, '2026-08-28')).toEqual([])
  })

  it('answers with nothing when there is no first entry at all', () => {
    expect(completedDietWeeks(null, '2026-09-20')).toEqual([])
  })

  it('does not loop on a first entry in the future', () => {
    /** A clock somebody set forward, or a row nobody expected. It has to end,
     *  not hang the tab. */
    expect(completedDietWeeks('2027-01-01', '2026-09-20')).toEqual([])
  })
})

describe('across a change of clocks', () => {
  /**
   * Europe/Warsaw moves twice a year, and a week counted in milliseconds loses
   * or gains an hour at each move — which is enough to drop a day out of a
   * seven-day span. The arithmetic here is calendar-based (`addDays` in
   * utils/days.ts builds `new Date(y, m, d + n)`, `fromIsoDate` parses local
   * midnight), so these pass; what they are for is the day somebody "simplifies"
   * that into `date.getTime() + days * 86400000`, which moves the end of the
   * October week below from the 27th to the 26th.
   *
   * Both weeks deliberately start on a Wednesday: a Monday-to-Sunday week puts
   * the changeover Sunday at its very end, where an off-by-one hour is easiest
   * to miss.
   */

  it('keeps seven distinct days when the clocks go back (25 October 2026)', () => {
    const [week] = completedDietWeeks('2026-10-21', '2026-10-28')

    expect([week.start, week.end]).toEqual(['2026-10-21', '2026-10-27'])
    expect(dietWeekDays(week)).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ])
    expect(new Set(dietWeekDays(week)).size).toBe(7)
  })

  it('keeps seven distinct days when the clocks go forward (28 March 2027)', () => {
    const [week] = completedDietWeeks('2027-03-24', '2027-03-31')

    expect([week.start, week.end]).toEqual(['2027-03-24', '2027-03-30'])
    expect(dietWeekDays(week)).toEqual([
      '2027-03-24',
      '2027-03-25',
      '2027-03-26',
      '2027-03-27',
      '2027-03-28',
      '2027-03-29',
      '2027-03-30',
    ])
    expect(new Set(dietWeekDays(week)).size).toBe(7)
  })

  it('puts the changeover day in exactly one week, on both moves', () => {
    /** The day the clocks move must belong to the week that contains it and to
     *  no other — the failure a millisecond span produces is a day that lands
     *  in two weeks or in neither. */
    for (const [anchor, changeover] of [
      ['2026-10-21', '2026-10-25'],
      ['2027-03-24', '2027-03-28'],
    ]) {
      const weeks = completedDietWeeks(anchor, '2027-05-01')
      const holding = weeks.filter((week) => dietWeekDays(week).includes(changeover))

      expect(holding, changeover).toHaveLength(1)
      expect(holding[0].start <= changeover, changeover).toBe(true)
      expect(changeover <= holding[0].end, changeover).toBe(true)
    }
  })

  it('closes a week whose last day is the changeover day at midnight, not an hour off', () => {
    /** 22-28 March 2027 ends on the Sunday the clocks move. Asked on that day
     *  it is still running; asked on the Monday it is a report. */
    expect(completedDietWeeks('2027-03-22', '2027-03-28')).toEqual([])
    expect(completedDietWeeks('2027-03-22', '2027-03-29')).toHaveLength(1)

    /** And the same for the October move: 19-25 October 2026. */
    expect(completedDietWeeks('2026-10-19', '2026-10-25')).toEqual([])
    expect(completedDietWeeks('2026-10-19', '2026-10-26')).toHaveLength(1)
  })

  it('gives every week of both changeover fortnights exactly seven days', () => {
    for (const month of ['2026-10', '2027-03']) {
      for (let day = 18; day <= 28; day += 1) {
        const anchor = `${month}-${String(day).padStart(2, '0')}`
        const [week] = completedDietWeeks(anchor, '2027-06-01')

        expect(dietWeekDays(week), anchor).toHaveLength(7)
        expect(new Set(dietWeekDays(week)).size, anchor).toBe(7)
      }
    }
  })
})

describe('dietWeekDays', () => {
  it('lists the seven days in the week own order, starting at its first day', () => {
    const [week] = completedDietWeeks(FIRST_ENTRY, '2026-09-02')

    expect(dietWeekDays(week)).toEqual([
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ])
  })
})

describe('the week id', () => {
  it('names the week by its first day, in the app own convention', () => {
    expect(dietWeekId('2026-09-02')).toBe('week-2026-09-02')
    // And that it is the id the weeks actually carry. Newest first, so the
    // week the anchor opens is the last one.
    const weeks = completedDietWeeks('2026-09-02', '2026-09-20')

    expect(weeks[weeks.length - 1].id).toBe('week-2026-09-02')
  })

  /** There is no inverse of `dietWeekId` and no test for one: an id the app
   *  cannot parse and an id naming a week with no entries get the same answer
   *  from `findDietReport` (null), which is what both screens want. See the
   *  note where the parser used to be. */
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
