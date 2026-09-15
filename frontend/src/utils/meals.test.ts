import { describe, expect, it } from 'vitest'
import { mealsGenitive, mealsLocative, pluralMeals } from './meals'

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

/**
 * The same noun after two prepositions that govern two other cases.
 *
 * Three functions rather than one with a case argument: every call site knows
 * which preposition it is writing, and a wrong case is the kind of mistake that
 * only ever shows up on a screen — "przy 2 posiłki" parses fine and reads as
 * broken Polish. `mealsGenitive` moved here from utils/dietAnalysis.ts when the
 * weekly report needed the same case for the same word.
 */

describe('mealsGenitive', () => {
  it('declines "posiłek" for the preposition the captions use', () => {
    // "z 3 posiłków", not "z 3 posiłki" — the same split as entriesGenitive.
    expect(mealsGenitive(1)).toBe('posiłku')
    expect(mealsGenitive(3)).toBe('posiłków')
    expect(mealsGenitive(5)).toBe('posiłków')
    expect(mealsGenitive(0)).toBe('posiłków')
  })
})

describe('mealsLocative', () => {
  it('is singular for one', () => {
    expect(mealsLocative(1)).toBe('1 posiłku')
  })

  it('has one plural form for every other count, the 2-4 range included', () => {
    // This is the whole reason it is not `pluralMeals`: "przy 2 posiłki" is
    // what that would give, and it is not Polish.
    expect(mealsLocative(2)).toBe('2 posiłkach')
    expect(mealsLocative(4)).toBe('4 posiłkach')
    expect(mealsLocative(5)).toBe('5 posiłkach')
    expect(mealsLocative(12)).toBe('12 posiłkach')
    expect(mealsLocative(0)).toBe('0 posiłkach')
  })
})
