import { describe, expect, it } from 'vitest'
import { CLOCK_FORMAT, clockTime } from './clock'

/**
 * "The time is 24-hour everywhere" as a test rather than as a habit.
 *
 * Most times in the app never reach this file — the server sends them as
 * `%H:%M` strings and they are printed unchanged — so what is pinned here is
 * the handful the browser formats itself, plus the rule they follow.
 */
describe('clockTime', () => {
  it('writes the time of day in 24-hour form', () => {
    expect(clockTime('2026-09-17T16:20:00')).toBe('16:20')
    expect(clockTime('2026-09-17T08:10:00')).toBe('08:10')
  })

  it('never says am or pm', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(2026, 8, 17, hour, 30)
      expect(clockTime(at)).not.toMatch(/[ap]\.?\s?m\.?/i)
    }
  })

  /**
   * The reason the module asks for `hourCycle: 'h23'` and not `hour12: false`:
   * the h24 cycle writes midnight as "24:00", which nobody writes down — and
   * this app shows meals eaten at half past midnight.
   */
  it('writes midnight as 00:00, not 24:00', () => {
    expect(clockTime(new Date(2026, 8, 17, 0, 0))).toBe('00:00')
    expect(clockTime(new Date(2026, 8, 17, 0, 37))).toBe('00:37')
  })

  it('pads the hour, so times line up in a column', () => {
    expect(clockTime(new Date(2026, 8, 17, 7, 5))).toBe('07:05')
  })

  it('says nothing rather than "Invalid Date"', () => {
    expect(clockTime(null)).toBeNull()
    expect(clockTime(undefined)).toBeNull()
    expect(clockTime('')).toBeNull()
    expect(clockTime('bzdura')).toBeNull()
  })

  it('exports the options it uses, so a caller cannot ask for a different clock', () => {
    expect(CLOCK_FORMAT.hourCycle).toBe('h23')
    expect(CLOCK_FORMAT.hour12).toBeUndefined()
  })
})
