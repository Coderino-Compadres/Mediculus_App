import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PASSWORD_FIELDS,
  PENDING_BACKEND_MESSAGE,
  PendingBackendError,
  changePassword,
  deleteAccount,
  restoreConsent,
  withdrawConsent,
} from './account'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

/**
 * The account-level actions. Two of them are real and one is a stub, and the
 * split is what this file is about: `deleteAccount` performs **no request** and
 * always rejects, because telling somebody their health data is gone when
 * nothing happened is not a cosmetic lie — they may stop using the app on the
 * strength of it.
 */

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
  data_consent_at: null,
  services_consent_at: null,
  consents: {
    active: false,
    data: {
      granted_at: '2026-06-18T09:31:02Z',
      withdrawn_at: '2026-09-01T08:00:00Z',
      active: false,
    },
    services: { granted_at: '2026-06-18T09:31:02Z', withdrawn_at: null, active: true },
  },
}

beforeEach(() => mockedRequest.mockReset())

describe('withdrawConsent', () => {
  it('posts the scope and hands back the updated account', async () => {
    /** The updated user is what moves the app: the route guard reads
     *  `consents.active`, so the session gets the new one rather than the
     *  caller navigating by hand. */
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    const user = await withdrawConsent('data')

    expect(mockedRequest).toHaveBeenCalledWith('/api/account/consents/withdraw/', {
      method: 'POST',
      body: { scope: 'data' },
    })
    expect(user.consents.active).toBe(false)
    expect(user.consents.data.active).toBe(false)
  })

  it('carries each of the three scopes as the API spells them', async () => {
    for (const scope of ['data', 'services', 'all'] as const) {
      mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

      await withdrawConsent(scope)

      expect(mockedRequest).toHaveBeenLastCalledWith('/api/account/consents/withdraw/', {
        method: 'POST',
        body: { scope },
      })
    }
  })

  it('keeps the grant that the withdrawal did not erase', async () => {
    /** Withdrawal is its own column: a cleared `granted_at` would make "never
     *  consented" and "consented then withdrew" the same row (art. 7(1)). */
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    const user = await withdrawConsent('data')

    expect(user.consents.data.grantedAt).toBe('2026-06-18T09:31:02Z')
    expect(user.consents.data.withdrawnAt).toBe('2026-09-01T08:00:00Z')
  })

  it('does not swallow a refusal', async () => {
    const refusal = new Error('403')
    mockedRequest.mockRejectedValueOnce(refusal)

    await expect(withdrawConsent('all')).rejects.toBe(refusal)
  })
})

describe('restoreConsent', () => {
  it('posts the scope to the restore URL, not the withdraw one', async () => {
    mockedRequest.mockResolvedValueOnce({
      ...USER_PAYLOAD,
      consents: {
        active: true,
        data: {
          granted_at: '2026-09-02T10:00:00Z',
          withdrawn_at: '2026-09-01T08:00:00Z',
          active: true,
        },
        services: { granted_at: '2026-06-18T09:31:02Z', withdrawn_at: null, active: true },
      },
    })

    const user = await restoreConsent('data')

    expect(mockedRequest).toHaveBeenCalledWith('/api/account/consents/restore/', {
      method: 'POST',
      body: { scope: 'data' },
    })
    expect(user.consents.active).toBe(true)
  })

  it('sends no password — this is the direction that unblocks an account', async () => {
    /** Friction here costs somebody who changed their mind and protects
     *  nobody: whoever reaches it is already inside the session. */
    mockedRequest.mockResolvedValueOnce(USER_PAYLOAD)

    await restoreConsent('all')

    const body = mockedRequest.mock.calls[0][1]!.body as Record<string, unknown>

    expect(Object.keys(body)).toEqual(['scope'])
  })
})

describe('deleteAccount', () => {
  it('makes no request at all', async () => {
    await expect(
      deleteAccount({ password: 'Haslo123!', reason: 'delete-account' }),
    ).rejects.toBeInstanceOf(PendingBackendError)

    expect(mockedRequest).not.toHaveBeenCalled()
  })

  it('never resolves, so no screen can report a deletion that did not happen', async () => {
    /** The one failure mode worth a test of its own: a false success here could
     *  leave somebody believing their health data is gone. */
    const reasons = [
      'delete-account', 'withdraw-data-consent', 'withdraw-all-consents',
    ] as const

    for (const reason of reasons) {
      await expect(deleteAccount({ password: 'x', reason })).rejects.toThrow()
    }
  })

  it('rejects with the notice the screens render, not with an error message', async () => {
    await expect(
      deleteAccount({ password: 'x', reason: 'delete-account' }),
    ).rejects.toThrow(PENDING_BACKEND_MESSAGE)
  })

  it('names the endpoint it is waiting for, and which reason it was called with', async () => {
    /** So a console line during a demo says what is missing rather than just
     *  that something is. */
    await expect(
      deleteAccount({ password: 'x', reason: 'withdraw-all-consents' }),
    ).rejects.toMatchObject({
      name: 'PendingBackendError',
      endpoint: 'DELETE /api/account/ (reason: withdraw-all-consents)',
    })
  })

  it('does not put the password in the error it rejects with', async () => {
    const error: unknown = await deleteAccount({
      password: 'Haslo123!', reason: 'delete-account',
    }).then(() => null, (cause: unknown) => cause)

    const pending = error as PendingBackendError

    expect(JSON.stringify({ message: pending.message, endpoint: pending.endpoint }))
      .not.toContain('Haslo123!')
  })
})

describe('changePassword', () => {
  it("posts all three fields under the API's own names", async () => {
    /** The current password travels because it is checked server-side: a live
     *  session proves the device, not the person holding it. */
    mockedRequest.mockResolvedValueOnce(undefined)

    await changePassword({
      currentPassword: 'Stare123!',
      newPassword: 'Nowe12345!',
      confirmNewPassword: 'Nowe12345!',
    })

    expect(mockedRequest).toHaveBeenCalledWith('/api/account/password/', {
      method: 'POST',
      body: {
        current_password: 'Stare123!',
        new_password: 'Nowe12345!',
        new_password_confirm: 'Nowe12345!',
      },
    })
  })

  it('resolves with nothing — the endpoint answers 204', async () => {
    mockedRequest.mockResolvedValueOnce(undefined)

    await expect(
      changePassword({ currentPassword: 'a', newPassword: 'b', confirmNewPassword: 'b' }),
    ).resolves.toBeUndefined()
  })

  it('passes a refusal on, so the form can place it on an input', async () => {
    const refusal = new Error('400')
    mockedRequest.mockRejectedValueOnce(refusal)

    await expect(
      changePassword({ currentPassword: 'złe', newPassword: 'b', confirmNewPassword: 'b' }),
    ).rejects.toBe(refusal)
  })
})

describe('PASSWORD_FIELDS', () => {
  it('maps every field the request sends, so no verdict lands nowhere', async () => {
    /** A server error under a key this map does not know stays under its API
     *  name and renders on no input at all — the same failure REGISTER_FIELDS
     *  exists to prevent. */
    mockedRequest.mockResolvedValueOnce(undefined)

    await changePassword({ currentPassword: 'a', newPassword: 'b', confirmNewPassword: 'b' })
    const body = mockedRequest.mock.calls[0][1]!.body as Record<string, unknown>

    expect(Object.keys(body).sort()).toEqual(Object.keys(PASSWORD_FIELDS).sort())
  })

  it('points each API name at the input that produced it', () => {
    expect(PASSWORD_FIELDS).toEqual({
      current_password: 'currentPassword',
      new_password: 'newPassword',
      new_password_confirm: 'confirmNewPassword',
    })
  })
})
