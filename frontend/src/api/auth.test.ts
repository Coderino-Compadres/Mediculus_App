import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import {
  ACCOUNT_TYPES,
  cancelGuardianInvitation,
  fetchCurrentUser,
  GUARDIAN_STATUS,
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
  is_child: false,
  guardian_status: null,
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
      isChild: false,
      guardianStatus: null,
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
