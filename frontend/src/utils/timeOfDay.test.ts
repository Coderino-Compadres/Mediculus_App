import { describe, expect, it } from 'vitest'
import {
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_OPTIONS,
  TIME_OF_DAY_VALUES,
  isTimeOfDay,
  timeOfDayLabel,
} from './timeOfDay'

describe('the four parts of the day', () => {
  it('are exactly these four, in chronological order', () => {
    expect(TIME_OF_DAY_VALUES).toEqual(['morning', 'noon', 'evening', 'night'])
  })

  it('are labelled in Polish, one label per value', () => {
    expect(TIME_OF_DAY_OPTIONS.map((option) => option.label)).toEqual([
      'Rano',
      'Południe',
      'Wieczór',
      'Noc',
    ])
    expect(Object.keys(TIME_OF_DAY_LABELS)).toHaveLength(TIME_OF_DAY_OPTIONS.length)
  })
})

describe('isTimeOfDay', () => {
  it('accepts the four values', () => {
    for (const value of TIME_OF_DAY_VALUES) expect(isTimeOfDay(value)).toBe(true)
  })

  it('rejects anything else, including the labels and a bare clock reading', () => {
    for (const value of ['Rano', 'afternoon', 'popołudnie', '08:30', '', null, undefined, 3, {}]) {
      expect(isTimeOfDay(value)).toBe(false)
    }
  })

  it('is not fooled by a name off Object.prototype', () => {
    // `value in LABELS` walks the prototype chain, so this is the one string
    // shape that could pass without being one of the four.
    expect(isTimeOfDay('toString')).toBe(false)
  })
})

describe('timeOfDayLabel', () => {
  it('gives the Polish label', () => {
    expect(timeOfDayLabel('evening')).toBe('Wieczór')
  })

  it('gives null for an unanswered question, so a screen can leave the line out', () => {
    expect(timeOfDayLabel(undefined)).toBeNull()
    expect(timeOfDayLabel(null)).toBeNull()
  })
})
