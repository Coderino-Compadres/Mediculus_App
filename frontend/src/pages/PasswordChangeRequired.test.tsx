import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import PasswordChangeRequired from './PasswordChangeRequired'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import type { AuthUser } from '../api/auth'

vi.mock('../api/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account')>()
  return { ...actual, changePassword: vi.fn() }
})
const { changePassword } = await import('../api/account')
const mockedChange = vi.mocked(changePassword)

vi.mock('../api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auth')>()
  return { ...actual, fetchCurrentUser: vi.fn(), logout: vi.fn() }
})
const { fetchCurrentUser } = await import('../api/auth')
const mockedMe = vi.mocked(fetchCurrentUser)

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

/** The account this screen exists for: a specialist's, created by a colleague. */
const HELD: AuthUser = {
  ...TEST_USER,
  role: 'specjalista',
  isPatient: false,
  isSpecialist: true,
  isChild: null,
  mustChangePassword: true,
}

/** The same account after it has set a password of its own. */
const RELEASED: AuthUser = { ...HELD, mustChangePassword: false }

const GIVEN = 'ABCD-EFGH-JKMN-PQRT'
const CHOSEN = 'WlasneHaslo!2026'

beforeEach(() => {
  navigate.mockReset()
  mockedChange.mockReset()
  mockedChange.mockResolvedValue(undefined)
  mockedMe.mockReset()
  mockedMe.mockResolvedValue(RELEASED)
})

function render(setUser: (next: AuthUser | null) => void = () => {}) {
  return renderWithProviders(<PasswordChangeRequired />, {
    user: HELD,
    route: ROUTES.passwordChange,
    setUser,
  })
}

async function fillIn() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Hasło otrzymane przy zakładaniu konta/), GIVEN)
  await user.type(screen.getByLabelText('Nowe hasło'), CHOSEN)
  await user.type(screen.getByLabelText('Powtórz nowe hasło'), CHOSEN)
  return user
}

describe('PasswordChangeRequired — what it says', () => {
  it('explains that the password came from somebody else', () => {
    /** The reason the screen exists, and the one thing that makes the demand
     *  reasonable rather than bureaucratic. */
    render()

    expect(screen.getByRole('heading', { name: /Ustaw własne hasło/ })).toBeInTheDocument()
    expect(screen.getByText(/zna je więc jeszcze co najmniej jedna osoba/i)).toBeInTheDocument()
  })

  it('says what is behind the screen, so the demand has a stated reason', () => {
    render()

    expect(screen.getByText(/raportów pacjentów/i)).toBeInTheDocument()
  })

  it('does not call the given password "obecne", because nobody chose it', () => {
    render()

    expect(
      screen.getByLabelText(/Hasło otrzymane przy zakładaniu konta/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Obecne hasło')).not.toBeInTheDocument()
  })

  it('says plainly that a lost password cannot be resent', () => {
    /** There is no mail out of this deployment and no password reset, so the
     *  only honest answer is the one on screen: ask for the account again. */
    render()

    expect(screen.getByText(/nie wysyła żadnej poczty/i)).toBeInTheDocument()
  })

  it('offers signing out, so nobody is trapped on a form they cannot fill in', () => {
    render()

    expect(screen.getByRole('button', { name: 'Wyloguj się' })).toBeInTheDocument()
  })
})

describe('PasswordChangeRequired — setting the password', () => {
  it('sends both passwords and hands the updated account to the session', async () => {
    /** The screen does not navigate: it refreshes the session and lets the
     *  route guard decide where the app goes. */
    const setUser = vi.fn()
    render(setUser)
    const user = await fillIn()

    await user.click(screen.getByRole('button', { name: /Ustaw hasło/ }))

    await waitFor(() => expect(mockedChange).toHaveBeenCalledWith({
      currentPassword: GIVEN,
      newPassword: CHOSEN,
      confirmNewPassword: CHOSEN,
    }))
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(RELEASED))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('re-reads the account rather than assuming the flag is gone', async () => {
    /** POST /api/account/password/ answers 204 with no body, so unlike the
     *  consent screen there is no updated user in the response to trust. */
    const setUser = vi.fn()
    render(setUser)
    const user = await fillIn()

    await user.click(screen.getByRole('button', { name: /Ustaw hasło/ }))

    await waitFor(() => expect(mockedMe).toHaveBeenCalled())
  })

  it('shows the server verdict on the input that produced it', async () => {
    mockedChange.mockRejectedValueOnce(
      new ApiError(400, null, { current_password: 'Obecne hasło jest nieprawidłowe.' }),
    )
    const setUser = vi.fn()
    render(setUser)
    const user = await fillIn()

    await user.click(screen.getByRole('button', { name: /Ustaw hasło/ }))

    expect(await screen.findByText('Obecne hasło jest nieprawidłowe.')).toBeInTheDocument()
    expect(setUser).not.toHaveBeenCalled()
  })

  it('does not send anything when the repeat does not match', async () => {
    render()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Hasło otrzymane przy zakładaniu konta/), GIVEN)
    await user.type(screen.getByLabelText('Nowe hasło'), CHOSEN)
    await user.type(screen.getByLabelText('Powtórz nowe hasło'), 'InneHaslo!2026')

    await user.click(screen.getByRole('button', { name: /Ustaw hasło/ }))

    expect(mockedChange).not.toHaveBeenCalled()
    expect(await screen.findByText(/Hasła nie są identyczne/)).toBeInTheDocument()
  })

  it('reports a failure rather than leaving the account looking released', async () => {
    /** The write succeeded but the re-read did not, so the app cannot move.
     *  Saying "zapisano" here would describe a screen that is still on screen. */
    mockedMe.mockRejectedValueOnce(new ApiError(500, 'Nie udało się odświeżyć konta.'))
    const setUser = vi.fn()
    render(setUser)
    const user = await fillIn()

    await user.click(screen.getByRole('button', { name: /Ustaw hasło/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(setUser).not.toHaveBeenCalled()
  })
})
