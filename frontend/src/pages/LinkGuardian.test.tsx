import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import LinkGuardian from './LinkGuardian'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import type { AuthUser } from '../api/auth'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

// Keep the real module: the screen imports GUARDIAN_FIELDS and the status
// helpers from it too, and a wholesale replacement would strip them.
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  linkGuardian: vi.fn(),
  cancelGuardianInvitation: vi.fn(),
  fetchCurrentUser: vi.fn(),
}))
const { linkGuardian, cancelGuardianInvitation, fetchCurrentUser } = await import('../api/auth')
const mockedLink = vi.mocked(linkGuardian)
const mockedCancel = vi.mocked(cancelGuardianInvitation)
const mockedFetchUser = vi.mocked(fetchCurrentUser)

const MINOR: AuthUser = {
  ...TEST_USER,
  email: 'dziecko@wp.pl',
  dateOfBirth: '2012-04-02',
  isChild: true,
  guardianStatus: 'none',
}

const WAITING: AuthUser = { ...MINOR, guardianStatus: 'pending' }

function renderScreen(user: AuthUser = MINOR, setUser = vi.fn()) {
  const result = renderWithProviders(<LinkGuardian />, {
    user, setUser, route: ROUTES.linkGuardian,
  })
  return { ...result, setUser }
}

function emailInput() {
  return screen.getByLabelText(/adres e-mail rodzica/i)
}

function submit() {
  return userEvent.click(screen.getByRole('button', { name: /wyślij prośbę/i }))
}

beforeEach(() => {
  navigate.mockReset()
  mockedLink.mockReset()
  mockedCancel.mockReset()
  mockedFetchUser.mockReset()
})

describe('naming a guardian', () => {
  it('sends the address and puts the new status into the session', async () => {
    mockedLink.mockResolvedValueOnce(WAITING)
    const { setUser } = renderScreen()

    await userEvent.type(emailInput(), 'rodzic@wp.pl')
    await submit()

    await waitFor(() => expect(mockedLink).toHaveBeenCalledWith({ guardianEmail: 'rodzic@wp.pl' }))
    expect(setUser).toHaveBeenCalledWith(WAITING)
  })

  it('does not let the child into the app on its own', async () => {
    // Sending the form buys a pending request, nothing more — navigating away
    // would be the screen claiming a consent nobody has given.
    mockedLink.mockResolvedValueOnce(WAITING)
    renderScreen()

    await userEvent.type(emailInput(), 'rodzic@wp.pl')
    await submit()

    await waitFor(() => expect(mockedLink).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('says up front that only a guardian account will be accepted', async () => {
    // The backend accepts nothing but an account whose role is `rodzic`, and it
    // answers a patient's address exactly like an unregistered one — so the
    // screen has to state the rule rather than let the child guess from a
    // deliberately vague rejection.
    renderScreen()

    expect(screen.getByText(/konto rodzica lub opiekuna/i)).toBeInTheDocument()
    expect(screen.getByText(/konta pacjenta nie/i)).toBeInTheDocument()
  })

  it('says that the guardian has to accept before anything works', async () => {
    renderScreen()

    expect(screen.getByText(/sam zdecyduje/i)).toBeInTheDocument()
  })
})

describe('what the screen refuses before asking the server', () => {
  it('rejects a malformed address', async () => {
    renderScreen()
    await userEvent.type(emailInput(), 'rodzic-bez-malpy')
    await submit()

    expect(await screen.findByText(/poprawny adres e-mail/i)).toBeInTheDocument()
    expect(mockedLink).not.toHaveBeenCalled()
  })

  it("refuses the child's own address, the way parent_child_not_self would", async () => {
    renderScreen()
    // Same address, different case — the database constraint compares ids, so
    // the casing must not be what decides here either.
    await userEvent.type(emailInput(), 'Dziecko@WP.pl')
    await submit()

    expect(await screen.findByText(/Twój własny adres/i)).toBeInTheDocument()
    expect(mockedLink).not.toHaveBeenCalled()
  })
})

describe('when the server says no', () => {
  it('shows the rejection on the input that caused it', async () => {
    mockedLink.mockRejectedValueOnce(
      new ApiError(400, null, {
        guardian_email: 'Nie znaleziono konta rodzica lub opiekuna z tym adresem.',
      }),
    )

    renderScreen()
    await userEvent.type(emailInput(), 'nieznany@wp.pl')
    await submit()

    expect(await screen.findByText(/Nie znaleziono konta rodzica/i)).toBeInTheDocument()
  })

  it('never leaves the child on a screen that looks like it worked', async () => {
    mockedLink.mockRejectedValueOnce(new Error('network down'))
    const { setUser } = renderScreen()

    await userEvent.type(emailInput(), 'rodzic@wp.pl')
    await submit()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(setUser).not.toHaveBeenCalled()
  })
})

describe('waiting for the answer', () => {
  it('replaces the form, because there is nothing left to fill in', async () => {
    renderScreen(WAITING)

    expect(screen.getByRole('heading', { name: /czeka na odpowiedź/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/adres e-mail rodzica/i)).not.toBeInTheDocument()
  })

  it("offers no way to accept on the guardian's behalf", async () => {
    renderScreen(WAITING)

    expect(screen.queryByRole('button', { name: /zaakceptuj|potwierdź/i })).not.toBeInTheDocument()
  })

  it('re-asks the session when the child checks for an answer', async () => {
    const accepted: AuthUser = { ...MINOR, guardianStatus: 'accepted' }
    mockedFetchUser.mockResolvedValueOnce(accepted)
    const { setUser } = renderScreen(WAITING)

    await userEvent.click(screen.getByRole('button', { name: /sprawdź/i }))

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(accepted))
  })

  it('withdraws the request so a mistyped address is not a dead end', async () => {
    const cleared: AuthUser = { ...MINOR, guardianStatus: 'none' }
    mockedCancel.mockResolvedValueOnce(cleared)
    const { setUser } = renderScreen(WAITING)

    await userEvent.click(screen.getByRole('button', { name: /anuluj/i }))

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(cleared))
  })

  it('reports a failed check instead of pretending nothing happened', async () => {
    mockedFetchUser.mockRejectedValueOnce(new Error('network down'))
    renderScreen(WAITING)

    await userEvent.click(screen.getByRole('button', { name: /sprawdź/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('the only other way out', () => {
  it('offers signing out from both states, because every route redirects back here', async () => {
    const { unmount } = renderScreen()
    expect(screen.getByRole('button', { name: /wyloguj/i })).toBeInTheDocument()
    unmount()

    renderScreen(WAITING)
    expect(screen.getByRole('button', { name: /wyloguj/i })).toBeInTheDocument()
  })
})
