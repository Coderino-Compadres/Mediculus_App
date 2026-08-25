import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { ApiError } from '../api/client'
import { TEST_USER } from '../test/render'

vi.mock('../api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  logout: vi.fn(),
}))
const { fetchCurrentUser, logout } = await import('../api/auth')
const mockedFetchUser = vi.mocked(fetchCurrentUser)
const mockedLogout = vi.mocked(logout)

function Probe() {
  const { user, loading, signOut } = useAuth()
  // signOut re-throws after clearing the local user, and the real caller
  // (HeaderMenu.onSignOut) catches it so it can still navigate to /login. This
  // probe does the same; wiring signOut straight to onClick would leave the
  // rejection unhandled and fail the run for a reason the app does not have.
  const onSignOut = () => { void signOut().catch(() => {}) }
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : 'brak'}</span>
      <button type="button" onClick={onSignOut}>Wyloguj</button>
    </div>
  )
}

function renderProvider() {
  return render(<AuthProvider><Probe /></AuthProvider>)
}

beforeEach(() => {
  mockedFetchUser.mockReset()
  mockedLogout.mockReset()
})

describe('the session bootstrap', () => {
  it('starts as loading — the route guards must wait rather than bounce to login', async () => {
    mockedFetchUser.mockReturnValueOnce(new Promise(() => {}))

    renderProvider()

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
  })

  it('asks the server exactly once, because the cookie is HttpOnly', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(mockedFetchUser).toHaveBeenCalledTimes(1)
  })

  it('publishes the signed-in user', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('test@wp.pl'))
  })

  it('settles on "nobody" for a visitor', async () => {
    mockedFetchUser.mockResolvedValueOnce(null)

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('brak')
  })

  it('stops loading even when the API is unreachable', async () => {
    // Not the same as being logged out, but from the router's point of view it
    // leads to the same place — and it must not hang on the splash forever.
    mockedFetchUser.mockRejectedValueOnce(new ApiError(0, 'Brak połączenia.'))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('brak')
  })
})

describe('signing out', () => {
  it('ends the session server-side, not just locally', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)
    mockedLogout.mockResolvedValueOnce(undefined)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('test@wp.pl'))

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    expect(mockedLogout).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('brak'))
  })

  it('drops the local user even if the request fails', async () => {
    // A failed logout must not leave the app showing a session the person has
    // asked to end.
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)
    mockedLogout.mockRejectedValueOnce(new ApiError(500, null))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('test@wp.pl'))

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('brak'))
  })
})

describe('useAuth', () => {
  it('refuses to be used outside the provider instead of returning undefined', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow(/AuthProvider/)

    quiet.mockRestore()
  })
})
