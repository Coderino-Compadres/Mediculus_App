import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAccountProfile } from './profile'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

const PAYLOAD = {
  activity: { entry_count: 137, streak_days: 2 },
  care: { specialist: 'mgr Marta Zielińska', approach: 'CBT / DBT', phone: null },
}

beforeEach(() => mockedRequest.mockReset())

describe('fetchAccountProfile', () => {
  it('asks the one URL and maps the answer to camelCase', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    const profile = await fetchAccountProfile()

    expect(mockedRequest).toHaveBeenCalledWith('/api/account/profile/')
    expect(profile).toEqual({
      activity: { entryCount: 137, streakDays: 2 },
      care: { specialist: 'mgr Marta Zielińska', approach: 'CBT / DBT', phone: null },
    })
  })

  it('keeps a zero as a zero rather than falling back to a placeholder', async () => {
    /** A new account really has written nothing, and the screen has to be able
     *  to say 0 — the figures it used to show (8 and 6) came from the mockup. */
    mockedRequest.mockResolvedValueOnce({
      activity: { entry_count: 0, streak_days: 0 },
      care: null,
    })

    const profile = await fetchAccountProfile()

    expect(profile.activity).toEqual({ entryCount: 0, streakDays: 0 })
  })

  it('passes "no specialist assigned" through as null', async () => {
    /** `patient.specjalist` is nullable and unassigned is an ordinary state, so
     *  the screen gets null and says so in words. */
    mockedRequest.mockResolvedValueOnce({ ...PAYLOAD, care: null })

    expect((await fetchAccountProfile()).care).toBeNull()
  })

  it('keeps a specialist with no recorded approach', async () => {
    /** `specjalist.specjalization` is nullable too, and it only blanks the
     *  detail line under the therapist's name on the safety plan — it must not
     *  cost the patient the name itself. */
    mockedRequest.mockResolvedValueOnce({
      ...PAYLOAD,
      care: { specialist: 'mgr Marta Zielińska', approach: null, phone: null },
    })

    const care = (await fetchAccountProfile()).care

    expect(care?.specialist).toBe('mgr Marta Zielińska')
    expect(care?.approach).toBeNull()
  })

  it('never hands the safety plan a number to dial, whatever the payload says', async () => {
    /** No column holds a specialist's phone number, so anything arriving under
     *  that key is not one. A live `tel:` link under "Kontakt do terapeuty lub
     *  lekarza" that fails when tapped reads, in a bad moment, as the
     *  therapist's number being out of service — which is why this is dropped
     *  here rather than trusted. When a column does exist, this test is the one
     *  that has to be rewritten deliberately.
     */
    mockedRequest.mockResolvedValueOnce({
      ...PAYLOAD,
      care: { specialist: 'mgr Marta Zielińska', approach: 'CBT / DBT', phone: '000000000' },
    })

    expect((await fetchAccountProfile()).care?.phone).toBeNull()
  })

  it('does not swallow a refusal — a guardian gets 403 and the caller has to know', async () => {
    const refusal = new Error('403')
    mockedRequest.mockRejectedValueOnce(refusal)

    await expect(fetchAccountProfile()).rejects.toBe(refusal)
  })
})
