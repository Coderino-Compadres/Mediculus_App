import { describe, expect, it } from 'vitest'
import { qualificationLine, toQualifications } from './qualifications'

describe('qualificationLine', () => {
  it('reads field of study, university and diploma as one line', () => {
    expect(qualificationLine({
      university: 'Uniwersytet Rzeszowski',
      fieldOfStudy: 'Psychologia',
      diplomaNumber: '1234/2015',
    })).toBe('Psychologia, Uniwersytet Rzeszowski · dyplom nr 1234/2015')
  })

  it('is null for an account created before these were asked for', () => {
    // So a roster row shows no line, rather than one made of punctuation.
    expect(qualificationLine(toQualifications({}))).toBeNull()
  })

  it('leaves out whatever is missing', () => {
    expect(qualificationLine({
      university: null, fieldOfStudy: 'Dietetyka', diplomaNumber: null,
    })).toBe('Dietetyka')
  })
})
