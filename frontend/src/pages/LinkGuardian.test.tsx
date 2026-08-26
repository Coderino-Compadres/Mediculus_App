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

// Keep the real module: the screen imports GUARDIAN_FIELDS from it too.
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  linkGuardian: vi.fn(),
}))
const { linkGuardian } = await import('../api/auth')
const mockedLink = vi.mocked(linkGuardian)

const MINOR: AuthUser = {
  ...TEST_USER,
  email: 'dziecko@wp.pl',
  dateOfBirth: '2012-04-02',
  isChild: true,
  hasGuardian: false,
}

function renderScreen(user: AuthUser = MINOR) {
  return renderWithProviders(<LinkGuardian />, { user, route: ROUTES.linkGuardian })
}

function emailInput() {
  return screen.getByLabelText(/adres e-mail rodzica/i)
}

beforeEach(() => {
  navigate.mockReset()
  mockedLink.mockReset()
})

describe('naming a guardian', () => {
  it('sends the address and hands the updated session on, so the guard lets the child through', async () => {
    mockedLink.mockResolvedValueOnce({ ...MINOR, hasGuardian: true })

    renderScreen()
    await userEvent.type(emailInput(), 'rodzic@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: /powiąż konto/i }))

    await waitFor(() => expect(mockedLink).toHaveBeenCalledWith({ guardianEmail: 'rodzic@wp.pl' }))
    expect(navigate).toHaveBeenCalledWith(ROUTES.modules, { replace: true })
  })

  it('says the guardian needs an account of their own', async () => {
    // The decision behind the "no such account" error below: there is no
    // invitation mail, so the screen has to say so before the child submits.
    renderScreen()

    expect(screen.getByText(/musi mieć już własne konto/i)).toBeInTheDocument()
  })
})

describe('what the screen refuses before asking the server', () => {
  it('rejects a malformed address', async () => {
    renderScreen()
    await userEvent.type(emailInput(), 'rodzic-bez-malpy')
    await userEvent.click(screen.getByRole('button', { name: /powiąż konto/i }))

    expect(await screen.findByText(/poprawny adres e-mail/i)).toBeInTheDocument()
    expect(mockedLink).not.toHaveBeenCalled()
  })

  it("refuses the child's own address, the way parent_child_not_self would", async () => {
    renderScreen()
    // Same address, different case — the database constraint compares ids, so
    // the casing must not be what decides here either.
    await userEvent.type(emailInput(), 'Dziecko@WP.pl')
    await userEvent.click(screen.getByRole('button', { name: /powiąż konto/i }))

    expect(await screen.findByText(/Twój własny adres/i)).toBeInTheDocument()
    expect(mockedLink).not.toHaveBeenCalled()
  })
})

describe('when the server says no', () => {
  it('shows the rejection on the input that caused it', async () => {
    mockedLink.mockRejectedValueOnce(
      new ApiError(400, null, { guardian_email: 'Nie znaleziono konta opiekuna z tym adresem.' }),
    )

    renderScreen()
    await userEvent.type(emailInput(), 'nieznany@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: /powiąż konto/i }))

    expect(await screen.findByText(/Nie znaleziono konta opiekuna/i)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('never leaves the child on a screen that looks like it worked', async () => {
    mockedLink.mockRejectedValueOnce(new Error('network down'))

    renderScreen()
    await userEvent.type(emailInput(), 'rodzic@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: /powiąż konto/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('the only other way out', () => {
  it('offers signing out, because every other route redirects back here', async () => {
    renderScreen()

    expect(screen.getByRole('button', { name: /wyloguj/i })).toBeInTheDocument()
  })
})
