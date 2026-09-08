import { describe, expect, it } from 'vitest'
import { addDays, fromIsoDate, startOfWeek, toIsoDate } from './days'

/**
 * The frontend half of `core/days.py`. Every function here is about the
 * calendar rather than about a 24-hour window, and the traps are all the same
 * one: a `Date` that is really a UTC instant. `utils/analysis.test.ts` uses
 * these functions in passing; this file is where the boundary itself is pinned,
 * because "which day is this" decides whether today's entry is editable and
 * which week a report belongs to.
 */

describe('toIsoDate', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 00:30 local on the 3rd is still the 2nd in UTC. Reading the UTC day here
    // would file an entry written just after midnight under the previous day —
    // the exact bug settings.TIME_ZONE fixes on the backend.
    expect(toIsoDate(new Date(2026, 7, 3, 0, 30))).toBe('2026-08-03')
    expect(toIsoDate(new Date(2026, 7, 3, 23, 59, 59))).toBe('2026-08-03')
  })

  it('pads the month and the day, so the string sorts as a date', () => {
    /** The archive sorts by this key and the API's `date` fields use it, so
     *  '2026-1-9' would sort after '2026-10-09' and quietly reorder a list. */
    expect(toIsoDate(new Date(2026, 0, 9))).toBe('2026-01-09')
  })

  it('handles a four-digit year at both ends of it', () => {
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(toIsoDate(new Date(2027, 0, 1))).toBe('2027-01-01')
  })
})

describe('fromIsoDate', () => {
  it('gives local midnight rather than UTC midnight', () => {
    /** `new Date('2026-08-03')` is parsed as UTC midnight, which is the 2nd
     *  west of Greenwich — the reason this function spells the time out. */
    const date = fromIsoDate('2026-08-03')

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(7)
    expect(date.getDate()).toBe(3)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })

  it('round-trips with toIsoDate', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-08-03', '2026-12-31']) {
      expect(toIsoDate(fromIsoDate(iso))).toBe(iso)
    }
  })
})

describe('addDays', () => {
  it('steps forwards and backwards', () => {
    expect(toIsoDate(addDays(fromIsoDate('2026-08-03'), 4))).toBe('2026-08-07')
    expect(toIsoDate(addDays(fromIsoDate('2026-08-03'), -3))).toBe('2026-07-31')
  })

  it('crosses a month, a year and a leap day', () => {
    expect(toIsoDate(addDays(fromIsoDate('2026-08-31'), 1))).toBe('2026-09-01')
    expect(toIsoDate(addDays(fromIsoDate('2026-12-31'), 1))).toBe('2027-01-01')
    expect(toIsoDate(addDays(fromIsoDate('2024-02-28'), 1))).toBe('2024-02-29')
  })

  it('lands on midnight even when the day it started from did not', () => {
    /** The 7-day window and the streak both compare these values as days, so a
     *  leftover time of day would make "the same day" depend on the hour. */
    const stepped = addDays(new Date(2026, 7, 3, 22, 15), 1)

    expect(stepped.getHours()).toBe(0)
    expect(toIsoDate(stepped)).toBe('2026-08-04')
  })

  it('changes nothing at zero, but still normalizes to midnight', () => {
    const same = addDays(new Date(2026, 7, 3, 13, 0), 0)

    expect(toIsoDate(same)).toBe('2026-08-03')
    expect(same.getHours()).toBe(0)
  })
})

describe('startOfWeek', () => {
  it('is the Monday of that week, because the Polish week starts there', () => {
    // 2026-08-03 is a Monday, 2026-08-09 the Sunday that closes the same week.
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-08-03')))).toBe('2026-08-03')
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-08-06')))).toBe('2026-08-03')
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-08-09')))).toBe('2026-08-03')
  })

  it('does not read Sunday as the start of the week that follows it', () => {
    /** getDay() is Sunday-first, so an unshifted weekday would put Sunday in
     *  the next Monday-Sunday week and split every week's report in two. */
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-08-10')))).toBe('2026-08-10')
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-08-02')))).toBe('2026-07-27')
  })

  it('is idempotent, so a week key can be recomputed from itself', () => {
    const monday = startOfWeek(fromIsoDate('2026-08-06'))

    expect(toIsoDate(startOfWeek(monday))).toBe(toIsoDate(monday))
  })

  it('keeps a Monday even when the week straddles a month or a year', () => {
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-01-01')))).toBe('2025-12-29')
    expect(toIsoDate(startOfWeek(fromIsoDate('2026-09-02')))).toBe('2026-08-31')
  })

  it('ignores the time of day it was given', () => {
    expect(toIsoDate(startOfWeek(new Date(2026, 7, 9, 23, 59)))).toBe('2026-08-03')
  })
})
