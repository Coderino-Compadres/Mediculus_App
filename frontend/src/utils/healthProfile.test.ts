import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LEVELS,
  CONDITIONS,
  emptyHealthProfile,
  formatMeasurement,
  measurementProblem,
  parseMeasurement,
  toHealthProfileInput,
  typeMeasurement,
} from './healthProfile'
import type { ConditionId } from '../types/healthProfile'

/**
 * The health profile's pure half.
 *
 * Most of what is pinned here is absence — there is no function that compares
 * two masses, and these tests are where that stays true. The rest is the
 * difference between "nothing was written" and "zero", which on this screen is
 * the difference between a blank field and a claim about somebody's body.
 */

describe('the vocabulary', () => {
  it('holds §13\'s seventeen conditions and nothing else', () => {
    expect(CONDITIONS).toHaveLength(17)
  })

  it('keeps the artboard\'s order, so a chip never moves under the finger', () => {
    /** The A set floats picked chips to the top; the B set leaves them where
     *  they are, and that is what is followed — a chip that jumps somewhere
     *  else the moment it is tapped takes the next tap with it. */
    expect(CONDITIONS.map((c) => c.id).slice(0, 5)).toEqual([
      'diabetes-1', 'diabetes-2', 'insulin-resistance', 'pcos', 'hashimoto',
    ])
    expect(CONDITIONS.at(-1)?.id).toBe('autism')
  })

  it('puts the psychiatric diagnoses in the same list as the somatic ones', () => {
    /** The artboard's own decision, and a good one: a separate section would
     *  draw a line around the patient's psychiatric history and show them it
     *  is on the other side of it. */
    const ids = CONDITIONS.map((c) => c.id)
    const psychiatric = ['eating-disorder', 'depression', 'anxiety', 'adhd', 'autism']

    for (const id of psychiatric) expect(ids).toContain(id)
    // They sit inside the one array, after the somatic entries, with nothing
    // structural between them.
    expect(ids.indexOf('eating-disorder')).toBeGreaterThan(ids.indexOf('reflux'))
  })

  it('offers three activity levels and no default among them', () => {
    expect(ACTIVITY_LEVELS.map((o) => o.value)).toEqual(['low', 'moderate', 'high'])
    expect(emptyHealthProfile().activityLevel).toBeNull()
  })
})

describe('an empty profile', () => {
  it('is empty — every field, every time', () => {
    /** The whole screen depends on this staying true: there is no endpoint, so
     *  the alternative to blank fields is invented ones. See the header of
     *  utils/healthProfile.ts. */
    expect(emptyHealthProfile()).toEqual({
      heightCm: '',
      weightKg: '',
      targetWeightKg: '',
      activityLevel: null,
      allergies: '',
      intolerances: '',
      dietaryPreferences: '',
      conditions: [],
      ownConditions: [],
    })
  })

  it('hands back a fresh object, so one screen cannot dirty the next', () => {
    const first = emptyHealthProfile()
    first.conditions.push('pcos')

    expect(emptyHealthProfile().conditions).toEqual([])
  })

  it('is not aliased into the request body either', () => {
    /** The other half of the same rule, at the other end of the draft's life:
     *  `toHealthProfileInput` copies the picked conditions rather than handing
     *  the screen's own state array to whoever sends it. An API layer that
     *  sorted or normalised the payload would otherwise reorder React state in
     *  place, with nothing to re-render it. */
    const draft = { ...emptyHealthProfile(), conditions: ['pcos'] as ConditionId[] }
    const input = toHealthProfileInput(draft)

    expect(input.conditions).toEqual(['pcos'])
    expect(input.conditions).not.toBe(draft.conditions)

    input.conditions.push('hashimoto')
    expect(draft.conditions).toEqual(['pcos'])
  })
})

describe('typing a measurement', () => {
  it('keeps digits and drops everything else', () => {
    expect(typeMeasurement('71kg', 3)).toBe('71')
    expect(typeMeasurement('-71', 3)).toBe('71')
    expect(typeMeasurement('abc', 3)).toBe('')
  })

  it('accepts a decimal comma, which is how Polish writes one', () => {
    expect(typeMeasurement('71,5', 3)).toBe('71,5')
  })

  it('leaves a half-typed value alone instead of tidying it under the caret', () => {
    /** '71,' is somebody mid-word. A field that cleaned it up would delete the
     *  separator they just pressed. */
    expect(typeMeasurement('71,', 3)).toBe('71,')
  })

  it('keeps the separator the keyboard actually produced', () => {
    expect(typeMeasurement('71.5', 3)).toBe('71.5')
  })

  it('allows one separator and one decimal place', () => {
    expect(typeMeasurement('1,2,3', 3)).toBe('1,2')
    expect(typeMeasurement('71,55', 3)).toBe('71,5')
  })

  it('caps the whole part, so a paste cannot fill the field with digits', () => {
    expect(typeMeasurement('1234567', 3)).toBe('123')
  })
})

describe('reading a measurement', () => {
  it('reads both separators', () => {
    expect(parseMeasurement('71,5')).toBe(71.5)
    expect(parseMeasurement('71.5')).toBe(71.5)
  })

  it('reads a half-typed value as the number it already is', () => {
    expect(parseMeasurement('71,')).toBe(71)
  })

  it('answers null for nothing written, never 0', () => {
    /** "Not filled in" and "weighs zero" are different claims and only the
     *  first one is ever true. */
    expect(parseMeasurement('')).toBeNull()
    expect(parseMeasurement(',')).toBeNull()
    expect(parseMeasurement('0')).toBeNull()
  })
})

describe('writing a stored measurement back into a field', () => {
  /**
   * The inverse of `parseMeasurement`, and the only place a number from the
   * server becomes one of these fields. What it has to get right is somebody's
   * own answer read back to them unchanged.
   */
  it('writes a decimal with the separator Polish uses', () => {
    expect(formatMeasurement(71.5)).toBe('71,5')
  })

  it('does not add a precision nobody claimed', () => {
    /** The column is NUMERIC(4,1), so a whole number comes back as 168.0.
     *  "168,0 cm" is a different statement from "168 cm". */
    expect(formatMeasurement(168)).toBe('168')
    expect(formatMeasurement(168.0)).toBe('168')
  })

  it('keeps a float\'s tail out of the field', () => {
    expect(formatMeasurement(71.30000000000001)).toBe('71,3')
  })

  it('answers an empty field for nothing stored, never a zero', () => {
    /** The same distinction `parseMeasurement` keeps going the other way: a
     *  patient who has not filled in a weight has not weighed zero. */
    expect(formatMeasurement(null)).toBe('')
    expect(formatMeasurement(Number.NaN)).toBe('')
  })

  it('round-trips whatever somebody typed', () => {
    for (const typed of ['168', '71,5', '99,9', '5']) {
      expect(formatMeasurement(parseMeasurement(typed))).toBe(typed)
    }
  })
})

describe('a gentle word about an unusable value', () => {
  it('says nothing at all about an empty field', () => {
    /** No field blocks the save and no field is required, so a blank is never
     *  something to answer for. */
    expect(measurementProblem('', 'kg')).toBeNull()
    expect(measurementProblem('   ', 'cm')).toBeNull()
  })

  it('says nothing about a value it can read', () => {
    expect(measurementProblem('71,5', 'kg')).toBeNull()
  })

  it('asks rather than accuses', () => {
    const notice = measurementProblem('0', 'kg')

    expect(notice).toContain('Sprawdź')
    // No language of failure on a screen about somebody's own body.
    for (const forbidden of [/błąd/i, /błędn/i, /nieprawidłow/i, /niepoprawn/i]) {
      expect(notice).not.toMatch(forbidden)
    }
  })

  it('names the unit it wants, so the fix is obvious', () => {
    expect(measurementProblem('0', 'cm')).toContain('centymetr')
    expect(measurementProblem('0', 'kg')).toContain('kilogram')
  })
})

describe('the draft as a request body', () => {
  it('turns typed text into numbers and blanks into null', () => {
    const input = toHealthProfileInput({
      ...emptyHealthProfile(),
      heightCm: '168',
      weightKg: '71,5',
    })

    expect(input.heightCm).toBe(168)
    expect(input.weightKg).toBe(71.5)
    expect(input.targetWeightKg).toBeNull()
    expect(input.allergies).toBeNull()
  })

  it('trims the descriptive fields and drops empty hand-written conditions', () => {
    const input = toHealthProfileInput({
      ...emptyHealthProfile(),
      allergies: '  orzechy  ',
      ownConditions: ['  migrena ', '   ', ''],
    })

    expect(input.allergies).toBe('orzechy')
    expect(input.ownConditions).toEqual(['migrena'])
  })

  it('carries no field that compares the two masses', () => {
    /** The safeguard §13 asks for, pinned at the layer where it would be
     *  cheapest to break: a difference computed here would reach every screen
     *  that ever renders this shape. */
    const input = toHealthProfileInput({
      ...emptyHealthProfile(),
      weightKg: '71',
      targetWeightKg: '66',
    })

    expect(Object.keys(input).sort()).toEqual([
      'activityLevel', 'allergies', 'conditions', 'dietaryPreferences',
      'heightCm', 'intolerances', 'ownConditions', 'targetWeightKg', 'weightKg',
    ])
    // Nothing in the payload is the gap, the ratio or anything else derived.
    expect(Object.values(input)).not.toContain(5)
  })
})
