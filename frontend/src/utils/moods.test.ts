import { describe, expect, it } from 'vitest'
import { MOOD_OPTIONS, MOOD_RANK } from './moods'
import type { MoodLevel } from '../types/diaryEntry'

/**
 * The five-tile mood question. `MoodPicker.test.tsx` covers the control; this is
 * about the two exports agreeing with each other, because the tiles are drawn
 * from one and the archive's badge and day-quality filter are computed from the
 * other — a value in one and not in the other is a tile that cannot be filtered
 * or a filter with no tile.
 */

describe('MOOD_OPTIONS', () => {
  it('holds the five levels in scale order, worst first', () => {
    expect(MOOD_OPTIONS.map((option) => option.value)).toEqual([
      'very_bad', 'bad', 'neutral', 'good', 'very_good',
    ])
  })

  it('labels every tile in Polish and gives it a colour', () => {
    for (const option of MOOD_OPTIONS) {
      expect(option.label.trim()).not.toBe('')
      expect(option.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('gives no two tiles the same colour, so the badge is unambiguous', () => {
    const colors = MOOD_OPTIONS.map((option) => option.color)

    expect(new Set(colors).size).toBe(colors.length)
  })
})

describe('MOOD_RANK', () => {
  it('covers exactly the values MOOD_OPTIONS offers', () => {
    expect(Object.keys(MOOD_RANK).sort()).toEqual(
      MOOD_OPTIONS.map((option) => option.value).sort(),
    )
  })

  it('is 1-5 in the same order the tiles are drawn in', () => {
    /** The ranks are compared against each other by the "Dobre dni"/"Trudniejsze
     *  dni" filter and averaged into the report's mood figure, so the order is
     *  the meaning — not just a set of distinct numbers. */
    const ranks = MOOD_OPTIONS.map((option) => MOOD_RANK[option.value])

    expect(ranks).toEqual([1, 2, 3, 4, 5])
  })

  it('puts neutral in the middle, which is what makes a delta a direction', () => {
    expect(MOOD_RANK.neutral).toBe(3)
    expect(MOOD_RANK.very_bad).toBeLessThan(MOOD_RANK.neutral)
    expect(MOOD_RANK.very_good).toBeGreaterThan(MOOD_RANK.neutral)
  })

  it('has no gaps, so an average of the ranks is on the 1-5 scale the report prints', () => {
    const levels = Object.keys(MOOD_RANK) as MoodLevel[]
    const ranks = levels.map((level) => MOOD_RANK[level]).sort((a, b) => a - b)

    expect(ranks).toEqual([1, 2, 3, 4, 5])
  })
})
