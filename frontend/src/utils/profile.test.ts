import { describe, expect, it } from 'vitest'
import { consentDateLabel, fullName, initials } from './profile'

/**
 * The profile's wording, as pure functions so it can be pinned without mounting
 * the screen. `Profile.test.tsx` renders one avatar and `utils/consents.test.ts`
 * covers `consentDateLabel` inside the consent register — this file is about the
 * edges: an account with no name at all, and a name the API sends as null.
 *
 * Both name columns are nullable (`mock_data.sql` seeds rows with neither), so
 * "no name" is an ordinary state rather than a broken row.
 */

describe('initials', () => {
  it('takes one letter from each name', () => {
    expect(initials('Anna', 'Kowalska', 'anna@wp.pl')).toBe('AK')
  })

  it('takes one letter when only one name is recorded', () => {
    expect(initials('Anna', null, 'anna@wp.pl')).toBe('A')
    expect(initials(null, 'Kowalska', 'anna@wp.pl')).toBe('K')
  })

  it('falls back to the address when the account has no name', () => {
    /** An empty circle reads as a failed image rather than as a missing name. */
    expect(initials(null, null, 'anna@wp.pl')).toBe('A')
  })

  it('never answers with an empty string, even with nothing to work from', () => {
    expect(initials(null, null, null)).toBe('?')
    expect(initials('', '', '')).toBe('?')
    expect(initials('   ', '   ', '   ')).toBe('?')
  })

  it('upper-cases in the UI locale', () => {
    expect(initials('ola', 'żak', 'ola@wp.pl')).toBe('OŻ')
  })

  it('keeps a Polish letter as one letter', () => {
    expect(initials('Łukasz', 'Ćwik', 'l@wp.pl')).toBe('ŁĆ')
  })

  it('ignores whitespace around a name instead of taking a space as the initial', () => {
    expect(initials('  Anna', 'Kowalska  ', 'anna@wp.pl')).toBe('AK')
  })

  it('does not cut a character outside the BMP in half', () => {
    /** `charAt` would return half a surrogate pair and render as a replacement
     *  glyph; `Array.from` is what keeps this a letter. */
    expect(initials('𝒜nna', null, 'a@wp.pl')).toBe('𝒜')
  })
})

describe('fullName', () => {
  it('joins the two halves with a space', () => {
    expect(fullName('Anna', 'Kowalska')).toBe('Anna Kowalska')
  })

  it('gives whichever half exists on its own', () => {
    expect(fullName('Anna', null)).toBe('Anna')
    expect(fullName(null, 'Kowalska')).toBe('Kowalska')
  })

  it('answers null when the account has neither, so the screen shows the address alone', () => {
    expect(fullName(null, null)).toBeNull()
    expect(fullName('', '')).toBeNull()
    expect(fullName('  ', '\t')).toBeNull()
  })

  it('does not leave a stray space from a blank half', () => {
    expect(fullName('Anna', '   ')).toBe('Anna')
  })
})

describe('consentDateLabel', () => {
  it('prints the day, the month by name and the year', () => {
    /** A consent can be years old, so the year is not optional — and the time is
     *  deliberately left out: the column is kept to prove *when* (art. 7(1)),
     *  and a date is what the person reading their own profile needs. */
    const label = consentDateLabel('2026-07-14T09:31:02Z')

    expect(label).toContain('2026')
    expect(label).toContain('lipca')
  })

  it('answers null for a value that is not a date at all', () => {
    /** So a malformed column shows the consent without a date, rather than
     *  printing the words "Invalid Date" next to a legal claim. */
    for (const value of ['', 'wczoraj', 'nie-data', '2026-13-45T00:00:00Z']) {
      expect(consentDateLabel(value)).toBeNull()
    }
  })

  it('takes the stored instant, not a pre-formatted day', () => {
    expect(consentDateLabel('2026-01-02T22:15:00Z')).not.toBeNull()
    expect(consentDateLabel('2026-01-02')).not.toBeNull()
  })
})
