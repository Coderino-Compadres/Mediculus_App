import { describe, expect, it } from 'vitest'
import { pluralMeals } from './meals'

/**
 * One definition of "3 posiłki", because two screens say it.
 *
 * The home screen used to have its own copy and it was wrong past four ("5
 * posiłki") — the ordinary fate of a Polish declension living in a component.
 */

describe('pluralMeals', () => {
  it('is singular for one', () => {
    expect(pluralMeals(1)).toBe('1 posiłek')
  })

  it('takes the 2-4 form', () => {
    expect(pluralMeals(2)).toBe('2 posiłki')
    expect(pluralMeals(4)).toBe('4 posiłki')
    expect(pluralMeals(23)).toBe('23 posiłki')
  })

  it('takes the genitive plural past four, and for the teens', () => {
    expect(pluralMeals(5)).toBe('5 posiłków')
    expect(pluralMeals(12)).toBe('12 posiłków')
    expect(pluralMeals(14)).toBe('14 posiłków')
    expect(pluralMeals(0)).toBe('0 posiłków')
  })
})
