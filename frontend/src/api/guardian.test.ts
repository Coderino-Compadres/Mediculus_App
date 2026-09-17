import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptGuardianInvitation,
  fetchGuardianChildren,
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


describe('fetchGuardianChildren — the attention marker', () => {
  const CHILD = {
    id: 'c0000000-0000-0000-0000-000000000001',
    child_name: 'Ola',
    child_surname: 'Testowa',
    child_email: 'dziecko@wp.pl',
    linked_at: '2026-08-12T09:31:02Z',
    consents_active: true,
    activity: { entry_count: 12, streak_days: 4, last_entry_date: '2026-09-01' },
  }

  it('carries the flag through', async () => {
    mockedRequest.mockResolvedValueOnce([{ ...CHILD, needs_attention: true }])

    const [child] = await fetchGuardianChildren()

    expect(child.needsAttention).toBe(true)
  })

  it('reads a missing flag as no marker', async () => {
    /** A marker is a claim about a report; a backend that does not send the
     *  field has told us nothing, and a client must not invent the claim. Note
     *  this is the opposite default from `consentsActive`, which defaults to
     *  true — there, "we were not told" means the older behaviour was in force. */
    mockedRequest.mockResolvedValueOnce([CHILD])

    const [child] = await fetchGuardianChildren()

    expect(child.needsAttention).toBe(false)
  })

  it('brings back no count and no reason, because none is sent', async () => {
    /** Pins the shape rather than the screen: the day somebody adds a count to
     *  the payload, this is where it should be noticed and argued about. */
    mockedRequest.mockResolvedValueOnce([{ ...CHILD, needs_attention: true }])

    const [child] = await fetchGuardianChildren()

    expect(Object.keys(child).sort()).toEqual([
      'activity', 'childEmail', 'childName', 'childSurname', 'consentsActive',
      'dietActivity', 'id', 'linkedAt', 'needsAttention',
    ])
  })
})


describe('fetchGuardianChildren — the diet module', () => {
  const CHILD = {
    id: 'c0000000-0000-0000-0000-000000000001',
    child_name: 'Ola',
    child_surname: 'Testowa',
    child_email: 'dziecko@wp.pl',
    linked_at: '2026-08-12T09:31:02Z',
    consents_active: true,
    needs_attention: false,
    activity: { entry_count: 12, streak_days: 4, last_entry_date: '2026-09-01' },
  }

  it('maps the food diary figures to their own key', async () => {
    mockedRequest.mockResolvedValueOnce([{
      ...CHILD,
      diet_activity: { entry_count: 8, streak_days: 2, last_entry_date: '2026-09-02' },
    }])

    const [child] = await fetchGuardianChildren()

    expect(child.dietActivity)
      .toEqual({ entryCount: 8, streakDays: 2, lastEntryDate: '2026-09-02' })
  })

  it('keeps the two modules apart rather than summing them', async () => {
    /** The app counts them apart everywhere else, and a total would be a third
     *  meaning of "wpis" that no screen uses — see DIET_CHILD_SUMMARY_FIELDS. */
    mockedRequest.mockResolvedValueOnce([{
      ...CHILD,
      diet_activity: { entry_count: 8, streak_days: 2, last_entry_date: '2026-09-02' },
    }])

    const [child] = await fetchGuardianChildren()

    expect(child.activity?.entryCount).toBe(12)
    expect(child.dietActivity?.entryCount).toBe(8)
  })

  it('reads a missing key as "not told", never as an empty food diary', async () => {
    /** Same default as `needsAttention` and for the same reason: zeroes would be
     *  a claim the client cannot make on a backend that sends nothing. */
    mockedRequest.mockResolvedValueOnce([CHILD])

    const [child] = await fetchGuardianChildren()

    expect(child.dietActivity).toBeNull()
  })

  it('passes a locked account through as null, like the other half', async () => {
    mockedRequest.mockResolvedValueOnce([{
      ...CHILD, consents_active: false, activity: null, diet_activity: null,
    }])

    const [child] = await fetchGuardianChildren()

    expect(child.activity).toBeNull()
    expect(child.dietActivity).toBeNull()
  })
})
