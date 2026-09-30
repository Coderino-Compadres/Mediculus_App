import { describe, expect, it } from 'vitest'
import {
  DURATION_NOT_A_NUMBER,
  DURATION_TOO_LARGE,
  DURATION_TOO_SMALL,
  durationError,
} from './duration'

describe('durationError', () => {
  it('accepts an empty field — the duration is optional', () => {
    expect(durationError('')).toBeNull()
    expect(durationError('   ')).toBeNull()
  })

  it('accepts whole minutes within the backend bounds', () => {
    for (const value of ['1', '5', ' 15 ', '600']) expect(durationError(value)).toBeNull()
  })

  it('refuses anything that is not whole minutes instead of dropping it', () => {
    for (const value of ['abc', '5 min', '5,5', '5.5', '-3', '1e2']) {
      expect(durationError(value)).toBe(DURATION_NOT_A_NUMBER)
    }
  })

  it('refuses the values the backend would refuse, in its words', () => {
    expect(durationError('0')).toBe(DURATION_TOO_SMALL)
    expect(durationError('601')).toBe(DURATION_TOO_LARGE)
  })
})
