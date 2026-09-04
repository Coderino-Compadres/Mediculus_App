import { describe, expect, it } from 'vitest'
import { patientLabel } from './specialist'

/**
 * How the panel names a patient. Three screens use this — the caseload card, the
 * reports header and the guardian-code form — and a specialist with several
 * patients has to be able to tell one row from another, which is why the
 * fallbacks matter more here than they look.
 */
describe('patientLabel', () => {
  it('uses the full name when there is one', () => {
    expect(
      patientLabel({ name: 'Ola', surname: 'Testowa', email: 'ola@wp.pl' }),
    ).toBe('Ola Testowa')
  })

  it('falls back to the address rather than half a name', () => {
    expect(
      patientLabel({ name: null, surname: null, email: 'ola@wp.pl' }),
    ).toBe('ola@wp.pl')
  })

  it('accepts a row with only one half of the name', () => {
    expect(patientLabel({ name: 'Ola', surname: null, email: 'ola@wp.pl' })).toBe('Ola')
  })

  it('never renders an unlabelled row', () => {
    // Every one of the three columns is nullable in this schema, so this row is
    // possible — and a blank card is one a specialist cannot act on.
    expect(patientLabel({ name: null, surname: null, email: null })).toBe('Konto pacjenta')
  })

  it('ignores whitespace-only values, which are not names', () => {
    expect(patientLabel({ name: '  ', surname: '  ', email: 'ola@wp.pl' })).toBe('ola@wp.pl')
  })
})
