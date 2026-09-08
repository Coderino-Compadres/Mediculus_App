import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import { useAccountProfile } from './useAccountProfile'
import type { AccountProfile } from '../types/profile'

vi.mock('../api/profile', () => ({ fetchAccountProfile: vi.fn() }))
const { fetchAccountProfile } = await import('../api/profile')
const mockedFetch = vi.mocked(fetchAccountProfile)

/**
 * `GET /api/account/profile/`, shared by "Profil" and "Plan bezpieczeństwa" so
 * the two cannot disagree about who the treating specialist is.
 *
 * Three rules, each of which the screens depend on:
 *
 * - **it does not ask for every account.** The endpoint is behind
 *   `_require_patient`, so a guardian or a specialist would be answered 403 —
 *   correctly, since "0 wpisów, brak terapeuty" is a clinical record of somebody
 *   who is not a clinical subject. `hasPatientProfile` mirrors that rule and the
 *   request is never made, which is also why `loading` must be false there;
 * - **a failure is reported, not swallowed**, because rendering the absence
 *   silently reads as "you have written nothing" and "you have no therapist";
 * - **`failed` is cleared on success**, or a retry that works would still hide
 *   the data it just loaded.
 */

const GUARDIAN = { ...TEST_USER, isPatient: false, isChild: null, role: 'rodzic' }

const PROFILE: AccountProfile = {
  activity: { entryCount: 137, streakDays: 2 },
  care: { specialist: 'mgr Marta Zielińska', approach: 'CBT / DBT', phone: null },
}

function Probe() {
  const { data, loading, failed, retry } = useAccountProfile()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="failed">{String(failed)}</span>
      <span data-testid="entries">{data ? String(data.activity.entryCount) : 'brak'}</span>
      <button type="button" onClick={retry}>Spróbuj ponownie</button>
    </div>
  )
}

beforeEach(() => {
  mockedFetch.mockReset()
})

describe('for a patient', () => {
  it('asks once and hands the answer over', async () => {
    mockedFetch.mockResolvedValueOnce(PROFILE)

    renderWithProviders(<Probe />)

    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('137'))
    expect(mockedFetch).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('is loading until the answer arrives', () => {
    mockedFetch.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(<Probe />)

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('entries')).toHaveTextContent('brak')
  })

  it('reports a failure instead of rendering an empty profile', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))

    renderWithProviders(<Probe />)

    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'))
    expect(screen.getByTestId('entries')).toHaveTextContent('brak')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('asks again on retry and clears the failure when it works', async () => {
    /** A hook that keeps a stale `failed` hides the data it has just loaded. */
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    mockedFetch.mockResolvedValueOnce(PROFILE)

    renderWithProviders(<Probe />)
    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'))

    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('137'))
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })

  it('goes back to loading while the retry is in flight', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    mockedFetch.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(<Probe />)
    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'))

    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
  })

  it('passes an unassigned specialist through rather than treating it as a failure', async () => {
    /** `patient.specjalist` is SET_NULL and an account registered before the
     *  first appointment has nobody assigned — an ordinary state. */
    mockedFetch.mockResolvedValueOnce({ ...PROFILE, care: null })

    renderWithProviders(<Probe />)

    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('137'))
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
  })
})

describe('for an account with no patient row', () => {
  it('never makes the request', async () => {
    /** Rather than making it and hiding the 403: the refusal is correct, and a
     *  request nobody may make is one nobody should send. */
    renderWithProviders(<Probe />, { user: GUARDIAN })

    await Promise.resolve()

    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('is not "loading" either, so a screen does not wait for nothing', () => {
    renderWithProviders(<Probe />, { user: GUARDIAN })

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(screen.getByTestId('entries')).toHaveTextContent('brak')
  })

  it('makes no request for a visitor with no session at all', () => {
    renderWithProviders(<Probe />, { user: null })

    expect(mockedFetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
})

describe('unmounting', () => {
  it('does not set state after the screen is gone', async () => {
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args))

    let resolve: (value: AccountProfile) => void = () => {}
    mockedFetch.mockReturnValueOnce(new Promise((done) => { resolve = done }))

    const { unmount } = renderWithProviders(<Probe />)
    unmount()
    resolve(PROFILE)
    await Promise.resolve()

    expect(errors).toEqual([])
    spy.mockRestore()
  })
})
