import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import Profile from './Profile'
import { ROUTES } from '../routes'
import { PENDING_BACKEND_MESSAGE, PendingBackendError } from '../api/account'
import { CONSENTS } from '../utils/consents'

vi.mock('../api/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account')>()
  return {
    ...actual,
    deleteAccount: vi.fn(actual.deleteAccount),
    withdrawConsent: vi.fn(actual.withdrawConsent),
    requestDataExport: vi.fn(actual.requestDataExport),
  }
})
const { deleteAccount, withdrawConsent } = await import('../api/account')
const mockedDelete = vi.mocked(deleteAccount)
const mockedWithdraw = vi.mocked(withdrawConsent)

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

beforeEach(() => {
  navigate.mockReset()
  // mockImplementation does not clear call history, and these assertions care
  // about who was *not* called.
  mockedDelete.mockReset()
  mockedWithdraw.mockReset()
  // Back to the real stubs, which reject with PendingBackendError.
  mockedDelete.mockImplementation(() =>
    Promise.reject(new PendingBackendError('DELETE /api/account/')),
  )
  mockedWithdraw.mockImplementation((scope) =>
    Promise.reject(new PendingBackendError(`withdraw ${scope}`)),
  )
})

/** Opens the "Twoje dane i zgody" path named by the button's label. */
async function open(label: string | RegExp) {
  await userEvent.click(screen.getByRole('button', { name: label }))
}

describe('Profile', () => {
  it('shows the signed-in account rather than a hardcoded example patient', () => {
    renderWithProviders(<Profile />, {
      user: { ...TEST_USER, firstName: 'Jakub', lastName: 'Wojciechowski', email: 'jakub@wp.pl' },
    })

    expect(screen.getByRole('heading', { name: 'Jakub Wojciechowski' })).toBeInTheDocument()
    expect(screen.getByText('jakub@wp.pl')).toBeInTheDocument()
    // The initials are generated, not stored — and 'AK' belongs to the mockup.
    expect(screen.getByText('JW')).toBeInTheDocument()
    expect(screen.queryByText(/Anna Kowalska/)).not.toBeInTheDocument()
  })

  it('falls back to the e-mail when the account has no name, rather than an empty heading', () => {
    renderWithProviders(<Profile />, {
      user: { ...TEST_USER, firstName: null, lastName: null, email: 'ktos@wp.pl' },
    })

    expect(screen.getByRole('heading', { name: 'ktos@wp.pl' })).toBeInTheDocument()
    expect(screen.getByText('K')).toBeInTheDocument()
  })

  it('shows two counters and not the mockup third one — techniques cannot be counted', () => {
    renderWithProviders(<Profile />)

    expect(screen.getByText('wpisów')).toBeInTheDocument()
    expect(screen.getByText('dni z rzędu')).toBeInTheDocument()
    expect(screen.queryByText('technik')).not.toBeInTheDocument()
  })

  it('offers nothing that disconnects the specialist — that is the specialist’s action', () => {
    renderWithProviders(<Profile />)

    expect(screen.getByText('mgr Marta Zielińska')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /odłącz|cofnij dostęp|odbierz dostęp/i })).toBeNull()
  })

  it('quotes both consents in the wording the registration form used', () => {
    renderWithProviders(<Profile />)

    for (const consent of CONSENTS) {
      expect(screen.getByText(consent.label)).toBeInTheDocument()
    }
  })

  it('sends the health-data consent and the account deletion to the same confirmation', async () => {
    renderWithProviders(<Profile />)

    await open('Usuń konto')
    expect(screen.getByRole('heading', { name: 'Co zostanie usunięte' })).toBeInTheDocument()

    await open('Anuluj')

    // Withdrawing the art. 9 consent ends the account, so it must not look milder:
    // the same list of what goes, and a lead that says so.
    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    expect(screen.getByRole('heading', { name: 'Co zostanie usunięte' })).toBeInTheDocument()
    expect(screen.getByText(/kończy korzystanie z konta/)).toBeInTheDocument()
  })

  it('withdraws both consents at once through its own path', async () => {
    renderWithProviders(<Profile />)

    await open('Wycofaj obie zgody naraz')

    expect(screen.getByRole('heading', { name: 'Wycofaj obie zgody' })).toBeInTheDocument()
  })

  it('leaves the services-consent consequences open instead of inventing them', async () => {
    renderWithProviders(<Profile />)

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])

    expect(screen.getByRole('heading', { name: 'Wycofaj zgodę na usługi' })).toBeInTheDocument()
    expect(screen.getByText(/Do ustalenia z Fundacją/)).toBeInTheDocument()
    // The one thing this screen must not do is claim the account survives — or
    // that it does not.
    expect(screen.queryByText(/Co zostanie usunięte/)).toBeNull()
  })

  it('never tells the user the account was deleted, because nothing was', async () => {
    renderWithProviders(<Profile />)

    await open('Usuń konto')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Usuń konto na stałe')

    expect(await screen.findByText(PENDING_BACKEND_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText(/Twoje konto i dane są nietknięte/)).toBeInTheDocument()
  })

  it('asks for the password before confirming a closure', async () => {
    renderWithProviders(<Profile />)

    await open('Usuń konto')
    await open('Usuń konto na stałe')

    expect(await screen.findByText('Podaj hasło.')).toBeInTheDocument()
    expect(screen.queryByText(PENDING_BACKEND_MESSAGE)).toBeNull()
  })

  it('says the export is not wired up yet rather than pretending to download', async () => {
    renderWithProviders(<Profile />)

    await open('Pobierz moje dane')

    expect(await screen.findByText(PENDING_BACKEND_MESSAGE)).toBeInTheDocument()
  })

  it('validates the new e-mail with the same rule as registration', async () => {
    renderWithProviders(<Profile />)

    await open('Zmień adres e-mail')
    await userEvent.type(screen.getByLabelText('Nowy adres e-mail'), 'nie-adres')
    await open('Zapisz nowy e-mail')

    expect(await screen.findByText('Podaj poprawny adres e-mail.')).toBeInTheDocument()
  })

  it('will not accept a new password shorter than the registration minimum', async () => {
    renderWithProviders(<Profile />)

    await open('Zmień hasło')
    await userEvent.type(screen.getByLabelText('Obecne hasło'), 'stare-haslo')
    await userEvent.type(screen.getByLabelText('Nowe hasło'), 'krotkie')
    await userEvent.type(screen.getByLabelText('Powtórz nowe hasło'), 'krotkie')
    await open('Zapisz nowe hasło')

    expect(await screen.findByText('Hasło musi mieć co najmniej 8 znaków.')).toBeInTheDocument()
  })

  it('refuses two passwords that do not match, on the field that produced it', async () => {
    renderWithProviders(<Profile />)

    await open('Zmień hasło')
    await userEvent.type(screen.getByLabelText('Obecne hasło'), 'stare-haslo')
    await userEvent.type(screen.getByLabelText('Nowe hasło'), 'nowe-haslo-1')
    await userEvent.type(screen.getByLabelText('Powtórz nowe hasło'), 'nowe-haslo-2')
    await open('Zapisz nowe hasło')

    expect(await screen.findByText('Hasła nie są identyczne.')).toBeInTheDocument()
  })

  it('signs out through the same path the header menu uses', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<Profile />, { signOut })

    // The header menu has one of its own, but only while it is open — closed, the
    // profile's own button is the only one on the screen.
    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    expect(signOut).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true })
  })

  it('sends the scope the entry point implies, not the one a screen guessed', async () => {
    renderWithProviders(<Profile />)

    await open('Wycofaj obie zgody naraz')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgody i zamknij konto')

    await screen.findByText(PENDING_BACKEND_MESSAGE)
    expect(mockedWithdraw).toHaveBeenCalledWith('all')
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('withdrawing only the health-data consent sends scope "data"', async () => {
    renderWithProviders(<Profile />)

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgodę i zamknij konto')

    await screen.findByText(PENDING_BACKEND_MESSAGE)
    expect(mockedWithdraw).toHaveBeenCalledWith('data')
  })

  it('withdrawing only the services consent sends scope "services"', async () => {
    renderWithProviders(<Profile />)

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgodę na usługi')

    await screen.findByText(PENDING_BACKEND_MESSAGE)
    expect(mockedWithdraw).toHaveBeenCalledWith('services')
  })

  /*
   * The two below are about the day the stubs become real endpoints. Both assert
   * an absence, because both screens carry a sentence that is true only while
   * nothing has happened — keyed on the form's success status rather than on the
   * stub's answer, a resolving endpoint made each of them say the opposite of the
   * truth.
   */
  it('does not claim the data is untouched once the deletion actually succeeds', async () => {
    mockedDelete.mockResolvedValue(undefined)
    const signOut = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<Profile />, { signOut })

    await open('Usuń konto')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Usuń konto na stałe')

    // The account is gone, so the only correct next step is to leave.
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }))
    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByText(/nietknięte/)).toBeNull()
    expect(screen.queryByText(PENDING_BACKEND_MESSAGE)).toBeNull()
  })

  it('does not say the services consent still stands once it has been withdrawn', async () => {
    mockedWithdraw.mockResolvedValue(undefined)
    renderWithProviders(<Profile />)

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgodę na usługi')

    expect(await screen.findByText(/została wycofana/)).toBeInTheDocument()
    expect(screen.queryByText(/nadal obowiązuje/)).toBeNull()
  })

  it('names the confirmation screen to a screen reader by focusing its heading', async () => {
    renderWithProviders(<Profile />)

    await open('Usuń konto')

    // The button that opened it has unmounted; without this, focus falls to <body>
    // and nothing announces that this is a destructive screen.
    expect(screen.getByRole('heading', { name: 'Usuń konto', level: 1 })).toHaveFocus()
  })
})
