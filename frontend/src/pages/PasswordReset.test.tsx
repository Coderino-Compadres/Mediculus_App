import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import PasswordReset, { CONFIRMATION } from './PasswordReset'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'

// Keep the real module: the screen imports PASSWORD_RESET_FIELDS from it too.
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  requestPasswordReset: vi.fn(),
}))
const { requestPasswordReset } = await import('../api/auth')
const mockedRequest = vi.mocked(requestPasswordReset)

function renderScreen() {
  return renderWithProviders(<PasswordReset />, { user: null, route: ROUTES.passwordReset })
}

const emailInput = () => screen.getByLabelText(/adres e-mail/i)
const submitButton = () => screen.getByRole('button', { name: /wyślij link/i })

async function submit(email = 'anna@example.com') {
  await userEvent.type(emailInput(), email)
  await userEvent.click(submitButton())
}

beforeEach(() => {
  mockedRequest.mockReset()
  mockedRequest.mockResolvedValue(undefined)
})

describe('PasswordReset', () => {
  it('asks for an address and nothing else', () => {
    renderScreen()

    expect(emailInput()).toBeInTheDocument()
    expect(screen.queryByLabelText(/hasło/i)).not.toBeInTheDocument()
  })

  it('sends the address to the API', async () => {
    renderScreen()

    await submit()

    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith({ email: 'anna@example.com' }))
  })

  it('confirms without saying whether the address has an account', async () => {
    renderScreen()

    await submit()

    const message = await screen.findByText(CONFIRMATION)
    expect(message).toBeInTheDocument()
    // "Jeśli konto…" and never "wysłaliśmy wiadomość na anna@example.com": the
    // sentence has to be one an address with no account produces too.
    expect(message.textContent).toMatch(/jeśli konto/i)
    expect(message.textContent).not.toContain('anna@example.com')
  })

  it('does not send a malformed address at all', async () => {
    renderScreen()

    await submit('to-nie-adres')

    expect(await screen.findByText(/podaj poprawny adres e-mail/i)).toBeInTheDocument()
    expect(mockedRequest).not.toHaveBeenCalled()
  })

  it('does not claim success when the request failed', async () => {
    mockedRequest.mockRejectedValue(new ApiError(429, 'Zbyt wiele prób. Odczekaj chwilę.'))
    renderScreen()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(/zbyt wiele prób/i)
    expect(screen.queryByText(CONFIRMATION)).not.toBeInTheDocument()
  })

  it('offers the way back to logging in', () => {
    renderScreen()

    expect(screen.getByRole('link', { name: /wróć do logowania/i })).toHaveAttribute(
      'href', ROUTES.login,
    )
  })
})
