import { describe, expect, it } from 'vitest'
import {
  DRINKS,
  OTHER_DRINKS,
  WATER,
  formatGlasses,
  pluralGlasses,
  weekdayLabel,
} from './drinks'

/**
 * The hydration vocabulary and the three formatters around it.
 *
 * The agreement with `backend/core/drinks.py` is checked from the other side,
 * in `test_drinks.py`, which parses this file — the same arrangement the
 * emotions have. What is here is the behaviour the backend cannot see.
 */

describe('the vocabulary', () => {
  it('counts water and nothing else', () => {
    /** "Herbata, kawa i napary są zapisywane, ale nie przeliczane na wodę."
     *  (mockups §08) — so there is no coefficient in that module and there must
     *  not be one. */
    expect(WATER).toBe('Woda')
    expect(OTHER_DRINKS).not.toContain(WATER)
  })

  it('puts water with lemon among the others, which is the client\'s call', () => {
    expect(OTHER_DRINKS).toContain('Woda z cytryną')
  })

  it('is water plus the five chips, in the artboard\'s order', () => {
    expect(DRINKS).toEqual([WATER, ...OTHER_DRINKS])
    expect(new Set(DRINKS).size).toBe(DRINKS.length)
  })
})

describe('formatGlasses', () => {
  it('writes a whole count without a decimal', () => {
    expect(formatGlasses(4)).toBe('4')
    expect(formatGlasses(0)).toBe('0')
  })

  it('writes a fraction with a Polish comma', () => {
    expect(formatGlasses(1.6)).toBe('1,6')
  })

  it('does not round a fraction away', () => {
    /** 400 ml is 1,6 glasses; "2" would report back more than was entered. */
    expect(formatGlasses(1.6)).not.toBe('2')
  })
})

describe('pluralGlasses', () => {
  it('declines the whole numbers Polish declines', () => {
    expect(pluralGlasses(1)).toBe('szklanka')
    expect(pluralGlasses(2)).toBe('szklanki')
    expect(pluralGlasses(4)).toBe('szklanki')
    expect(pluralGlasses(5)).toBe('szklanek')
    expect(pluralGlasses(0)).toBe('szklanek')
  })

  it('gets the teens right, which are all genitive', () => {
    for (const count of [12, 13, 14]) {
      expect(pluralGlasses(count)).toBe('szklanek')
    }
    expect(pluralGlasses(22)).toBe('szklanki')
  })

  it('a fractional count takes the genitive, like "1,5 litra"', () => {
    expect(pluralGlasses(1.6)).toBe('szklanek')
    expect(pluralGlasses(2.5)).toBe('szklanek')
  })
})

describe('weekdayLabel', () => {
  it('writes the two-letter form the artboard uses', () => {
    // 2026-09-07 is a Monday.
    expect(weekdayLabel('2026-09-07')).toBe('Pn')
    expect(weekdayLabel('2026-09-12')).toBe('Sb')
    expect(weekdayLabel('2026-09-13')).toBe('Nd')
  })

  it('reads the date as a local day rather than a UTC instant', () => {
    /** `new Date('2026-09-07')` is UTC midnight, which west of Warsaw is the
     *  previous day — the same class of bug that moved the weekly report's
     *  week-has-ended cutoff to the backend. */
    expect(weekdayLabel('2026-09-07')).not.toBe('Nd')
  })
})
