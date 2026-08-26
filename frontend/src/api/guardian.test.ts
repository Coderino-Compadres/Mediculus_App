import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptGuardianInvitation,
  fetchGuardianInvitations,
  rejectGuardianInvitation,
} from './guardian'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

const INVITATION = {
  id: 'd0000000-0000-0000-0000-000000000001',
  child_name: 'Ola',
  child_surname: 'Testowa',
  child_email: 'dziecko@wp.pl',
}

beforeEach(() => mockedRequest.mockReset())

describe('fetchGuardianInvitations', () => {
  it('maps the answer to camelCase', async () => {
    mockedRequest.mockResolvedValueOnce([INVITATION])

    const [invitation] = await fetchGuardianInvitations()

    expect(mockedRequest).toHaveBeenCalledWith('/api/guardian/invitations/')
    expect(invitation).toEqual({
      id: INVITATION.id,
      childName: 'Ola',
      childSurname: 'Testowa',
      childEmail: 'dziecko@wp.pl',
    })
  })

  it('treats nobody having asked as an empty list, not as a problem', async () => {
    mockedRequest.mockResolvedValueOnce([])

    expect(await fetchGuardianInvitations()).toEqual([])
  })
})

describe('answering an invitation', () => {
  it('accepts by id', async () => {
    mockedRequest.mockResolvedValueOnce(undefined)

    await acceptGuardianInvitation(INVITATION.id)

    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/guardian/invitations/${INVITATION.id}/accept/`, { method: 'POST' },
    )
  })

  it('rejects by id', async () => {
    mockedRequest.mockResolvedValueOnce(undefined)

    await rejectGuardianInvitation(INVITATION.id)

    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/guardian/invitations/${INVITATION.id}/reject/`, { method: 'POST' },
    )
  })
})
