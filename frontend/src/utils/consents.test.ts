import { describe, expect, it } from 'vitest'
import { CONSENTS, CONSENT_IDS, consentById, consentGrants } from './consents'
import { consentDateLabel } from './profile'
import type { AuthUser } from '../api/auth'

/**
 * The consent register, which is the one part of the profile that is evidence
 * rather than display. RODO art. 7(1) puts the burden of proving consent on us,
 * and until these two columns were exposed the screen showed every account the
 * same invented date — the placeholder in this app that mattered most.
 */
const USER: AuthUser = {
  id: 'b0000000-0000-0000-0000-000000000008',
  email: 'test@wp.pl',
  firstName: 'Test',
  lastName: 'Testowy',
  dateOfBirth: '1994-06-18',
  role: 'patient',
  isPatient: true,
  isChild: false,
  guardianStatus: null,
  dataConsentAt: '2026-03-09T21:15:00Z',
  servicesConsentAt: '2026-03-09T21:15:00Z',
}

describe('consentGrants', () => {
  it('reports both consents with the moment this account granted them', () => {
    expect(consentGrants(USER)).toEqual([
      { id: CONSENT_IDS.data, grantedAt: '2026-03-09T21:15:00Z' },
      { id: CONSENT_IDS.services, grantedAt: '2026-03-09T21:15:00Z' },
    ])
  })

  it('lists them in CONSENTS order, so both screens agree on which comes first', () => {
    expect(consentGrants(USER).map((grant) => grant.id)).toEqual(
      CONSENTS.map((consent) => consent.id),
    )
  })

  it('omits a consent that was never granted rather than dating it', () => {
    /** NULL is what every row mock_data.sql seeds holds, and it is what a
     *  withdrawal would leave behind. No entry is what lets the screen render
     *  "Nieudzielona" as a fact instead of inferring it. */
    const grants = consentGrants({ ...USER, servicesConsentAt: null })

    expect(grants).toHaveLength(1)
    expect(grants[0].id).toBe(CONSENT_IDS.data)
  })

  it('is empty for an account that granted neither', () => {
    expect(
      consentGrants({ ...USER, dataConsentAt: null, servicesConsentAt: null }),
    ).toEqual([])
  })

  it('keeps the two apart — they were collected separately and go separately', () => {
    /** Art. 7(3): consent is per purpose, so one timestamp covering both would
     *  be the wrong shape and would make one withdrawal look like two. */
    const grants = consentGrants({ ...USER, dataConsentAt: null })

    expect(grants).toHaveLength(1)
    expect(grants[0].id).toBe(CONSENT_IDS.services)
  })
})

describe('consentDateLabel', () => {
  it('renders the calendar day of a stored instant, with its year', () => {
    /** A consent can be years old, so the year is not optional. */
    expect(consentDateLabel('2026-03-09T09:15:00Z')).toBe('9 marca 2026')
  })

  it('returns null for something that is not a date, rather than "Invalid Date"', () => {
    /** The line it feeds sits next to a legal claim; dropping it beats printing
     *  a browser error where a date should be. */
    expect(consentDateLabel('nie-data')).toBeNull()
    expect(consentDateLabel('')).toBeNull()
  })
})

describe('consentById', () => {
  it('throws for an id that is in one list and not the other', () => {
    // @ts-expect-error — the point is the runtime guard, not the type.
    expect(() => consentById('nieistniejaca')).toThrow(/Nieznana zgoda/)
  })
})
