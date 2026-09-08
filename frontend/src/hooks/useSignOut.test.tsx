import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { useSignOut } from './useSignOut'
import { ROUTES } from '../routes'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

/**
 * Signing out, from the header menu and from the profile's own button.
 *
 * One implementation for both, because ending a session has an easy way to be
 * subtly wrong and a second copy would be the copy that gets it wrong: **a
 * failed logout request still has to land the user on /login**. The local
 * session is cleared either way (see AuthProvider.signOut), so staying put would
 * leave a signed-out person looking at a signed-in shell until the first request
 * failed — and pressing the button again would not help.
 */

function Probe() {
  const signOut = useSignOut()
  return (
    <button type="button" onClick={() => void signOut()}>
      Wyloguj się
    </button>
  )
}

describe('useSignOut', () => {
  it('ends the session and lands on the login screen', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    navigate.mockReset()
    renderWithProviders(<Probe />, { signOut })

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj się' }))

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true })
  })

  it('lands on the login screen even when the logout request fails', async () => {
    /** The local session is gone regardless, so leaving somebody on a signed-in
     *  shell would be the one outcome worse than a failed request. */
    const signOut = vi.fn().mockRejectedValue(new Error('503'))
    navigate.mockReset()
    renderWithProviders(<Probe />, { signOut })

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj się' }))

    expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true })
  })

  it('replaces the history entry, so "back" is not a way onto the app again', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    navigate.mockReset()
    renderWithProviders(<Probe />, { signOut })

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj się' }))

    expect(navigate.mock.calls[0][1]).toEqual({ replace: true })
  })

  it('is stable across renders, so an effect depending on it does not loop', () => {
    /** `AccountClosureConfirm` calls it from an effect keyed on it; a new
     *  function on every render would sign the user out in a loop. */
    const seen = new Set<unknown>()
    function Watcher({ tick }: { tick: number }) {
      seen.add(useSignOut())
      return <span>{tick}</span>
    }
    const { rerender } = renderWithProviders(<Watcher tick={1} />)

    // A real second render (the wrapper, and therefore the session context, is
    // kept by rerender): a stable callback has to come back identical.
    rerender(<Watcher tick={2} />)

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(seen.size).toBe(1)
  })
})
