import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import Login from './Login'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

// Keep the real module: the screen imports LOGIN_FIELDS from it as well.
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  login: vi.fn(),
}))
const { login } = await import('../api/auth')
const mockedLogin = vi.mocked(login)

function renderScreen(setUser = vi.fn()) {
  const result = renderWithProviders(<Login />, {
    user: null, setUser, route: ROUTES.login,
  })
  return { ...result, setUser }
}

const emailInput = () => screen.getByLabelText(/adres e-mail/i)
const passwordInput = () => screen.getByLabelText(/hasło/i)
const submitButton = () => screen.getByRole('button', { name: /zaloguj się/i })

async function fillIn(email = 'anna@example.com', password = 'TajneHaslo123') {
  await userEvent.type(emailInput(), email)
  await userEvent.type(passwordInput(), password)
}

beforeEach(() => {
  navigate.mockReset()
  mockedLogin.mockReset()
})

describe('Login', () => {
  it('asks for an address and a password and nothing else', () => {
    renderScreen()

    expect(emailInput()).toBeInTheDocument()
    expect(passwordInput()).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  })

  it('keeps the password out of sight and lets the browser fill it', () => {
    renderScreen()

    expect(passwordInput()).toHaveAttribute('type', 'password')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password')
  })

  it('offers the way to registration, because a visitor may have neither', () => {
    renderScreen()

    expect(screen.getByRole('link', { name: /zarejestruj się/i })).toHaveAttribute(
      'href', ROUTES.register,
    )
  })
})

describe('Login — the info button', () => {
  const infoButton = () => screen.getByRole('button', { name: /informacje/i })

  it('starts closed, so the tile does not cover the form on arrival', () => {
    renderScreen()

    expect(infoButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('shows the tile when the "i" is clicked', async () => {
    renderScreen()

    await userEvent.click(infoButton())

    expect(await screen.findByRole('note')).toHaveTextContent(/numer konta dla darowizn/i)
    expect(infoButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes it again on a second click', async () => {
    renderScreen()

    await userEvent.click(infoButton())
    await screen.findByRole('note')
    await userEvent.click(infoButton())

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('closes it on Escape, so the keyboard is not trapped behind it', async () => {
    renderScreen()

    await userEvent.click(infoButton())
    await screen.findByRole('note')
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  /* type="button": it sits inside the card but outside the <form>, and a
     regression that moved it in must not turn it into a submit. */
  it('does not submit the form', async () => {
    renderScreen()

    await userEvent.click(infoButton())

    expect(mockedLogin).not.toHaveBeenCalled()
    expect(infoButton()).toHaveAttribute('type', 'button')
  })
})

describe('Login — checks before anything is sent', () => {
  it('does not call the API when the address is malformed', async () => {
    renderScreen()

    await fillIn('to-nie-jest-adres', 'TajneHaslo123')
    await userEvent.click(submitButton())

    expect(mockedLogin).not.toHaveBeenCalled()
    expect(await screen.findByText(/poprawny adres e-mail/i)).toBeInTheDocument()
  })

  it('does not call the API when a field is empty', async () => {
    renderScreen()

    await userEvent.click(submitButton())

    expect(mockedLogin).not.toHaveBeenCalled()
    expect(await screen.findByText(/podaj adres e-mail/i)).toBeInTheDocument()
    expect(screen.getByText(/podaj hasło/i)).toBeInTheDocument()
  })

  it('marks the input that failed, not the form', async () => {
    renderScreen()

    await fillIn('to-nie-jest-adres', 'TajneHaslo123')
    await userEvent.click(submitButton())

    await waitFor(() => expect(emailInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('Login — a session that opens', () => {
  it('hands the user straight to the session rather than re-asking the server', async () => {
    mockedLogin.mockResolvedValue(TEST_USER)
    const { setUser } = renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(TEST_USER))
  })

  it('sends exactly what was typed', async () => {
    mockedLogin.mockResolvedValue(TEST_USER)
    renderScreen()

    await fillIn('Anna@Example.com', 'TajneHaslo123')
    await userEvent.click(submitButton())

    await waitFor(() => expect(mockedLogin).toHaveBeenCalledWith({
      email: 'Anna@Example.com', password: 'TajneHaslo123',
    }))
  })

  it('replaces the login page in history so back does not return to it', async () => {
    mockedLogin.mockResolvedValue(TEST_USER)
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }))
  })

  it('locks the form while the request is in flight', async () => {
    let release: (user: typeof TEST_USER) => void = () => {}
    mockedLogin.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('button', { name: /logowanie…/i })).toBeDisabled()
    expect(emailInput()).toBeDisabled()

    release(TEST_USER)
  })

  it('does not send the same credentials twice on a double click', async () => {
    let release: (user: typeof TEST_USER) => void = () => {}
    mockedLogin.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())
    await userEvent.click(screen.getByRole('button', { name: /logowanie…/i }))

    expect(mockedLogin).toHaveBeenCalledTimes(1)
    release(TEST_USER)
  })
})

describe('Login — a session that does not open', () => {
  /**
   * The backend answers a wrong password and an unknown address identically,
   * and spends the same time on both, because for a mental-health service who
   * has an account is itself sensitive (see LoginSerializer.INVALID_CREDENTIALS
   * and test_auth_api.py). That care is wasted if this screen puts the message
   * under the e-mail box — "wrong here" is the same statement as "this address
   * exists". These three tests are the frontend half of that promise.
   */
  const REFUSAL = 'Nieprawidłowy e-mail lub hasło.'

  it('shows the refusal above the form', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSAL)
  })

  it('does not blame the address for it', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(emailInput()).toHaveAttribute('aria-invalid', 'false')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'false')
  })

  it('says nothing about whether the account exists', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(screen.queryByText(/nie ma takiego konta|nie znaleziono|nieznany adres/i))
      .not.toBeInTheDocument()
  })

  it('keeps what was typed so it can be corrected rather than retyped', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    renderScreen()

    await fillIn('anna@example.com', 'ZleHaslo1')
    await userEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(emailInput()).toHaveValue('anna@example.com')
  })

  it('unlocks the form again so a second attempt is possible', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(submitButton()).toBeEnabled()
  })

  it('stops shouting once the user starts editing', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())
    await screen.findByRole('alert')

    await userEvent.type(passwordInput(), 'x')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('places a field error the server did attribute under that field', async () => {
    mockedLogin.mockRejectedValue(
      new ApiError(400, null, { email: 'Podaj poprawny adres e-mail.' }),
    )
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    expect(await screen.findByText('Podaj poprawny adres e-mail.')).toBeInTheDocument()
    await waitFor(() => expect(emailInput()).toHaveAttribute('aria-invalid', 'true'))
  })

  it('explains a throttled attempt rather than looking like bad credentials', async () => {
    mockedLogin.mockRejectedValue(
      new ApiError(429, 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'),
    )
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/zbyt wiele prób/i)
  })

  it('does not open a session when the server said no', async () => {
    mockedLogin.mockRejectedValue(new ApiError(400, REFUSAL))
    const { setUser } = renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(setUser).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('survives a failure that is not an ApiError at all', async () => {
    mockedLogin.mockRejectedValue(new TypeError('Failed to fetch'))
    renderScreen()

    await fillIn()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/coś poszło nie tak/i)
  })
})
