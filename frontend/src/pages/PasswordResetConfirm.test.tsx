import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import PasswordResetConfirm, { MISSING_TOKEN, SUCCESS } from './PasswordResetConfirm'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'

// The token comes out of the URL, and these tests render the screen directly
// rather than through a <Routes> tree — so `useParams` is what stands in for the
// link that was clicked.
const params = vi.fn<() => Record<string, string | undefined>>(() => ({ token: 'token-z-maila' }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => params() }
})

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  confirmPasswordReset: vi.fn(),
}))
const { confirmPasswordReset } = await import('../api/auth')
const mockedConfirm = vi.mocked(confirmPasswordReset)

function renderScreen(setUser = vi.fn()) {
  const result = renderWithProviders(<PasswordResetConfirm />, {
    user: null, setUser, route: '/password-reset/token-z-maila',
  })
  return { ...result, setUser }
}

const passwordInput = () => screen.getByLabelText(/^nowe hasło$/i)
const confirmInput = () => screen.getByLabelText(/powtórz nowe hasło/i)
const submitButton = () => screen.getByRole('button', { name: /ustaw hasło/i })

async function submit(password = 'ZupelnieInne456', confirmation = password) {
  await userEvent.type(passwordInput(), password)
  await userEvent.type(confirmInput(), confirmation)
  await userEvent.click(submitButton())
}

beforeEach(() => {
  params.mockReturnValue({ token: 'token-z-maila' })
  mockedConfirm.mockReset()
  mockedConfirm.mockResolvedValue(undefined)
})

describe('PasswordResetConfirm', () => {
  it('asks for the new password twice and never shows the token', () => {
    const { container } = renderScreen()

    expect(passwordInput()).toHaveAttribute('type', 'password')
    expect(confirmInput()).toHaveAttribute('type', 'password')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'new-password')
    expect(container.textContent).not.toContain('token-z-maila')
  })

  it('posts the token from the URL together with the password', async () => {
    renderScreen()

    await submit()

    await waitFor(() =>
      expect(mockedConfirm).toHaveBeenCalledWith({
        token: 'token-z-maila',
        password: 'ZupelnieInne456',
        confirmPassword: 'ZupelnieInne456',
      }),
    )
  })

  it('clears the local session, because the server closed every one of them', async () => {
    const { setUser } = renderScreen()

    await submit()

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null))
  })

  it('replaces the form with the way to the login screen', async () => {
    renderScreen()

    await submit()

    expect(await screen.findByText(SUCCESS)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ustaw hasło/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /przejdź do logowania/i })).toHaveAttribute(
      'href', ROUTES.login,
    )
  })

  it('does not send a password that was mistyped the second time', async () => {
    renderScreen()

    await submit('ZupelnieInne456', 'CosInnego789')

    expect(await screen.findByText(/hasła nie są identyczne/i)).toBeInTheDocument()
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('does not send a password shorter than the rule everywhere else', async () => {
    renderScreen()

    await submit('krotkie')

    expect(await screen.findByText(/co najmniej 8 znaków/i)).toBeInTheDocument()
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('shows a dead link above the form, where a statement about the link belongs', async () => {
    mockedConfirm.mockRejectedValue(
      new ApiError(400, 'Link do ustawienia hasła jest nieprawidłowy lub wygasł.'),
    )
    renderScreen()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(/nieprawidłowy lub wygasł/i)
    // The form stays, so a person holding a second, newer link can use it here.
    expect(submitButton()).toBeInTheDocument()
  })

  it("places the server's verdict on the password under that field", async () => {
    mockedConfirm.mockRejectedValue(
      new ApiError(400, null, { new_password: 'To hasło jest zbyt powszechne.' }),
    )
    renderScreen()

    await submit('ZupelnieInne456')

    expect(await screen.findByText(/zbyt powszechne/i)).toBeInTheDocument()
  })

  it('offers a fresh link instead of a form when the URL carries no token', () => {
    params.mockReturnValue({})
    renderScreen()

    expect(screen.getByText(MISSING_TOKEN)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^nowe hasło$/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /poproś o nowy/i })).toHaveAttribute(
      'href', ROUTES.passwordReset,
    )
  })
})
