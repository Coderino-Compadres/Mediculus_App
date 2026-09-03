import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import {
  ACCOUNT_TYPES,
  cancelGuardianInvitation,
  fetchCurrentUser,
  GUARDIAN_STATUS,
  hasPatientProfile,
  needsConsents,
  isGuardianInvitationPending,
  linkGuardian,
  login,
  logout,
  needsGuardianLink,
  register,
  REGISTER_FIELDS,
  toFormErrors,
  LOGIN_FIELDS,
} from './auth'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

const USER_PAYLOAD = {
  id: 'b0000000-0000-0000-0000-000000000008',
  email: 'test@wp.pl',
  name: 'Test',
  surname: 'Testowy',
  date_of_birth: '1994-06-18',
  role: 'patient',
  is_patient: true,
  is_child: false,
  guardian_status: null,
  consents: {
    active: true,
    data: { granted_at: '2026-06-18T09:31:02Z', withdrawn_at: null, active: true },
    services: { granted_at: '2026-06-18T09:31:02Z', withdrawn_at: null, active: true },
  },
}

beforeEach(() => mockedRequest.mockReset())

describe('login', () => {
  it('posts only the credentials and maps the answer to camelCase', async () => {
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    const user = await login({ email: 'test@wp.pl', password: 'Haslo123!' })

    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/login/', {
      method: 'POST',
      body: { email: 'test@wp.pl', password: 'Haslo123!' },
    })
    expect(user).toEqual({
      id: USER_PAYLOAD.id,
      email: 'test@wp.pl',
      firstName: 'Test',
      lastName: 'Testowy',
      dateOfBirth: '1994-06-18',
      role: 'patient',
      isPatient: true,
      isChild: false,
      guardianStatus: null,
      consents: {
        active: true,
        data: { grantedAt: '2026-06-18T09:31:02Z', withdrawnAt: null, active: true },
        services: { grantedAt: '2026-06-18T09:31:02Z', withdrawnAt: null, active: true },
      },
    })
  })
})

describe('register', () => {
  it('translates every form field to the column the API expects', async () => {
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    await register({
      accountType: ACCOUNT_TYPES.patient,
      firstName: 'Test',
      lastName: 'Testowy',
      dateOfBirth: '1994-06-18',
      email: 'test@wp.pl',
      password: 'Haslo123!',
      confirmPassword: 'Haslo123!',
      dataConsent: true,
      servicesConsent: true,
    })

    expect(mockedRequest.mock.calls[0][1]!.body).toEqual({
      email: 'test@wp.pl',
      password: 'Haslo123!',
      password_confirm: 'Haslo123!',
      name: 'Test',
      surname: 'Testowy',
      date_of_birth: '1994-06-18',
      account_type: 'patient',
      data_consent: true,
      services_consent: true,
    })
  })

  it('uses the wire values the backend switches on, not display labels', () => {
    // ACCOUNT_TYPES mirrors core/serializers.py; 'minor_patient' is what decides
    // that a Patient row gets is_child=True.
    expect(Object.values(ACCOUNT_TYPES)).toEqual(['patient', 'minor_patient', 'parent'])
  })
})

describe('a guardian has no patient row, so some answers are legitimately null', () => {
  it('carries is_child: null through rather than turning it into false', async () => {
    mockedRequest.mockResolvedValueOnce({ ...USER_PAYLOAD, role: 'rodzic', is_child: null })

    const user = await login({ email: 'rodzic@example.com', password: 'x' })

    expect(user.isChild).toBeNull()
  })

  it('survives a role the database never seeded', async () => {
    mockedRequest.mockResolvedValueOnce({ ...USER_PAYLOAD, role: null })

    const user = await login({ email: 'test@wp.pl', password: 'x' })

    expect(user.role).toBeNull()
  })
})

describe('fetchCurrentUser', () => {
  it('returns the user when there is a session', async () => {
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    await expect(fetchCurrentUser()).resolves.toMatchObject({ email: 'test@wp.pl' })
  })

  it.each([401, 403])('treats %i as "nobody is logged in", not as a failure', async (status) => {
    mockedRequest.mockRejectedValueOnce(new ApiError(status, 'Nie podano danych.'))

    await expect(fetchCurrentUser()).resolves.toBeNull()
  })

  it('lets a real failure through — a dead API is not the same as a visitor', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(500, 'Błąd serwera.'))

    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError)
  })

  it('lets a network error through too', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(0, 'Brak połączenia.'))

    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('logout', () => {
  it('posts, so it is CSRF-protected and ends the session server-side', async () => {
    mockedRequest.mockResolvedValueOnce(undefined)

    await logout()

    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/logout/', { method: 'POST' })
  })
})

describe('toFormErrors', () => {
  it('re-keys a field error onto the input that produced it', () => {
    const result = toFormErrors({ date_of_birth: 'Zła data.' }, REGISTER_FIELDS)

    expect(result).toEqual({ dateOfBirth: 'Zła data.' })
  })

  it('leaves an unmapped key alone rather than dropping the message', () => {
    const result = toFormErrors({ cos_nowego: 'Komunikat.' }, REGISTER_FIELDS)

    expect(result).toEqual({ cos_nowego: 'Komunikat.' })
  })

  it('covers every field the registration form sends', () => {
    // A field missing here means a Django error lands nowhere visible.
    expect(Object.keys(REGISTER_FIELDS).sort()).toEqual([
      'account_type', 'data_consent', 'date_of_birth', 'email',
      'name', 'password', 'password_confirm', 'services_consent', 'surname',
    ])
    expect(Object.keys(LOGIN_FIELDS).sort()).toEqual(['email', 'password'])
  })
})

describe('linkGuardian', () => {
  it('posts the address under the column name the API uses', async () => {
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD, is_child: true, guardian_status: 'pending',
    })

    const user = await linkGuardian({ guardianEmail: 'rodzic@wp.pl' })

    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/guardian/', {
      method: 'POST',
      body: { guardian_email: 'rodzic@wp.pl' },
    })
    // Sending the form buys a pending request, not a link: the answer is the
    // updated user, and it says the child is still waiting.
    expect(user.guardianStatus).toBe(GUARDIAN_STATUS.pending)
  })
})

describe('cancelGuardianInvitation', () => {
  it('deletes the invitation and reads the status back off the answer', async () => {
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD, is_child: true, guardian_status: 'none',
    })

    const user = await cancelGuardianInvitation()

    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/guardian/', { method: 'DELETE' })
    expect(user.guardianStatus).toBe(GUARDIAN_STATUS.none)
  })
})

describe('needsGuardianLink', () => {
  const minor = { ...USER_PAYLOAD, is_child: true }

  async function signedIn(payload: Record<string, unknown>) {
    mockedRequest.mockResolvedValueOnce(payload)
    return login({ email: 'd@wp.pl', password: 'x' })
  }

  it('blocks a minor whose account names no guardian', async () => {
    expect(needsGuardianLink(await signedIn({ ...minor, guardian_status: 'none' }))).toBe(true)
  })

  it('keeps blocking while the invitation is unanswered', async () => {
    // The rule the whole flow exists for: being named is not consenting, so a
    // pending invitation unblocks nothing.
    const user = await signedIn({ ...minor, guardian_status: 'pending' })

    expect(needsGuardianLink(user)).toBe(true)
    expect(isGuardianInvitationPending(user)).toBe(true)
  })

  it('lets a minor through once the guardian has accepted', async () => {
    const user = await signedIn({ ...minor, guardian_status: 'accepted' })

    expect(needsGuardianLink(user)).toBe(false)
    expect(isGuardianInvitationPending(user)).toBe(false)
  })

  it('blocks rather than admits when the answer is missing', async () => {
    // A backend that does not send guardian_status, or sends null for an account
    // it cannot judge: an unvouched-for minor must not write health data.
    expect(needsGuardianLink(await signedIn(minor))).toBe(true)
  })

  it('never asks the question of an adult patient or a guardian', async () => {
    expect(needsGuardianLink(await signedIn({ ...USER_PAYLOAD, is_child: false }))).toBe(false)
    expect(
      needsGuardianLink(await signedIn({ ...USER_PAYLOAD, role: 'rodzic', is_child: null })),
    ).toBe(false)
  })
})

describe('consent timestamps', () => {
  it('carries both moments through, so the profile shows a real date', async () => {
    /** They used to be a constant reading 14 July 2026 for every account. A
     *  consent record is evidence (RODO art. 7(1)), and evidence identical for
     *  everybody proves nothing about anybody. */
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD,
      consents: {
        active: true,
        data: { granted_at: '2026-03-09T21:15:00Z', withdrawn_at: null, active: true },
        services: { granted_at: '2026-03-09T21:15:00Z', withdrawn_at: null, active: true },
      },
    })

    const user = await fetchCurrentUser()

    expect(user?.consents.data.grantedAt).toBe('2026-03-09T21:15:00Z')
    expect(user?.consents.services.grantedAt).toBe('2026-03-09T21:15:00Z')
  })

  it('keeps a consent that was never granted as null rather than inventing one', async () => {
    /** The column is NULL for every row mock_data.sql seeds, and that is what
     *  lets the profile say "Nieudzielona" as a fact. */
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD,
      consents: {
        active: false,
        data: { granted_at: '2026-03-09T21:15:00Z', withdrawn_at: null, active: true },
        services: { granted_at: null, withdrawn_at: null, active: false },
      },
    })

    const user = await fetchCurrentUser()

    expect(user?.consents.services.grantedAt).toBeNull()
    expect(user?.consents.services.active).toBe(false)
  })

  it('survives an older payload that carries no consents block', async () => {
    /** Same tolerance `guardian_status` already has: a field the deployed
     *  backend has not got yet must not make the session unreadable — and here
     *  it must not lock every account out of the app either. */
    const { consents, ...older } = USER_PAYLOAD
    void consents
    mockedRequest.mockResolvedValueOnce(older)

    const user = await fetchCurrentUser()

    expect(user?.consents.active).toBe(true)
    expect(user?.consents.data.grantedAt).toBeNull()
  })
})

describe('hasPatientProfile', () => {
  /**
   * Mirrors `_require_patient` in core/views.py, whose first check is simply
   * whether a `patient` row exists. Getting it wrong is visible either way: too
   * strict hides a patient's own counters, too loose fires a request that
   * answers 403 and shows a guardian an error box.
   */
  async function ask(payload: Record<string, unknown>) {
    mockedRequest.mockResolvedValueOnce({ ...USER_PAYLOAD, ...payload })
    return hasPatientProfile((await fetchCurrentUser())!)
  }

  it('is true for an adult patient and for a minor', async () => {
    expect(await ask({ is_patient: true, is_child: false })).toBe(true)
    expect(await ask({ is_patient: true, is_child: true })).toBe(true)
  })

  it('is false for an account with no patient row, whatever its role says', async () => {
    expect(await ask({ is_patient: false, is_child: null, role: 'rodzic' })).toBe(false)
  })

  it('is true for a patient row that never answered the minor question', async () => {
    /** THE CASE THIS FIELD EXISTS FOR. `is_child` is nullable and mock_data.sql
     *  predates it being set, so such a row is indistinguishable from a
     *  guardian's absent one — and the backend serves it (see
     *  test_guardian_gate.UngatedAccountTests). Inferring from `is_child` would
     *  hide a patient's own counters from them. */
    expect(await ask({ is_patient: true, is_child: null })).toBe(true)
  })

  it('does not key on the role, which is a nullable text column', async () => {
    /** `user_role` is looked up by name from data mock_data.sql seeds, so a
     *  patient with a missing role row is possible — and still a patient. */
    expect(await ask({ is_patient: true, is_child: false, role: null })).toBe(true)
  })

  it('falls back to is_child for a backend that does not send the field yet', async () => {
    /** The deployed backend may be a release behind. An adult patient still
     *  reads as one; only the `is_child` NULL row is misread, which is the
     *  narrower of the two mistakes and goes away on the next deploy. */
    const { is_patient, ...older } = USER_PAYLOAD
    void is_patient
    mockedRequest.mockResolvedValueOnce(older)
    expect(hasPatientProfile((await fetchCurrentUser())!)).toBe(true)

    mockedRequest.mockResolvedValueOnce({ ...older, is_child: null })
    expect(hasPatientProfile((await fetchCurrentUser())!)).toBe(false)
  })
})

describe('consent state', () => {
  it('reads the gate flag and both withdrawal moments off the payload', async () => {
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD,
      consents: {
        active: false,
        data: { granted_at: '2026-03-09T21:15:00Z',
                withdrawn_at: '2026-09-01T10:00:00Z', active: false },
        services: { granted_at: '2026-03-09T21:15:00Z', withdrawn_at: null, active: true },
      },
    })

    const user = await fetchCurrentUser()

    expect(user?.consents.active).toBe(false)
    expect(user?.consents.data.active).toBe(false)
    expect(user?.consents.data.withdrawnAt).toBe('2026-09-01T10:00:00Z')
    expect(user?.consents.services.active).toBe(true)
    expect(user?.consents.services.withdrawnAt).toBeNull()
  })

  it('needsConsents mirrors the flag, so one definition decides the gate', async () => {
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD,
      consents: {
        active: false,
        data: { granted_at: null, withdrawn_at: null, active: false },
        services: { granted_at: null, withdrawn_at: null, active: false },
      },
    })

    expect(needsConsents((await fetchCurrentUser())!)).toBe(true)
  })

  it('does not lock an account out when the backend sends no consents block', async () => {
    /** A deployed backend a release behind must not black out every client.
     *  The server refuses on its own regardless, so the worst a stale client
     *  does is show a screen and collect a 403. */
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    expect(needsConsents((await fetchCurrentUser())!)).toBe(false)
  })
})

describe('consent state is read, never recomputed', () => {
  /**
   * THE BUG THIS PINS. `granted_at` and `withdrawn_at` used to reach the browser
   * in different renderings of the same clock — the declared serializer fields
   * came out in Europe/Warsaw (`+02:00`), the ones inside `consents` came out in
   * UTC (`Z`) — and the screen compared them as strings. For a consent withdrawn
   * a fraction of a second after it was granted, `'…T10:…Z' <= '…T12:…+02:00'` is
   * true, so a withdrawn consent read as active: the restore screen showed
   * "Udzielona" and no button, and the account had nowhere to go.
   *
   * The payload is consistent now, but the durable fix is that nothing here
   * derives `active` at all.
   */
  it('trusts the server even when the timestamps sort the other way as strings', async () => {
    // The same instant, one rendered in Europe/Warsaw and one in UTC — which is
    // how the payload used to arrive.
    const grantedAt = '2026-09-03T12:53:33.632094+02:00'
    const withdrawnAt = '2026-09-03T10:53:33.842499Z'
    const consent = { granted_at: grantedAt, withdrawn_at: withdrawnAt, active: false }
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD,
      consents: { active: false, data: consent, services: consent },
    })

    const user = await fetchCurrentUser()

    // Sorted as text the withdrawal looks earlier; sorted as moments it is not.
    expect(withdrawnAt <= grantedAt).toBe(true)
    expect(new Date(withdrawnAt) <= new Date(grantedAt)).toBe(false)
    // The account stays locked either way, because nothing here compares them.
    expect(user?.consents.data.active).toBe(false)
    expect(needsConsents(user!)).toBe(true)
  })
})
