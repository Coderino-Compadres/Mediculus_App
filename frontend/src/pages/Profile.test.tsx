import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import Profile from './Profile'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import { PENDING_BACKEND_MESSAGE, PendingBackendError } from '../api/account'
import { CONSENTS } from '../utils/consents'
import type { AccountProfile } from '../types/profile'

vi.mock('../api/profile', () => ({ fetchAccountProfile: vi.fn() }))
const { fetchAccountProfile } = await import('../api/profile')
const mockedProfile = vi.mocked(fetchAccountProfile)

vi.mock('../api/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account')>()
  return {
    ...actual,
    deleteAccount: vi.fn(actual.deleteAccount),
    withdrawConsent: vi.fn(actual.withdrawConsent),
    changePassword: vi.fn(),
  }
})
const { changePassword, deleteAccount, withdrawConsent } = await import('../api/account')
const mockedChangePassword = vi.mocked(changePassword)
const mockedDelete = vi.mocked(deleteAccount)
const mockedWithdraw = vi.mocked(withdrawConsent)

/** The account as it comes back from a withdrawal: consents no longer in force. */
const LOCKED_USER = {
  ...TEST_USER,
  consentsActive: false,
  dataConsentWithdrawnAt: '2026-09-02T10:00:00Z',
  servicesConsentWithdrawnAt: '2026-09-02T10:00:00Z',
}

/** What GET /api/account/profile/ answers with for the ordinary patient. */
function accountProfile(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    activity: { entryCount: 8, streakDays: 6 },
    care: { specialist: 'mgr Marta Zielińska', approach: 'CBT / DBT', phone: null },
    ...overrides,
  }
}

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

beforeEach(() => {
  navigate.mockReset()
  mockedProfile.mockReset()
  mockedProfile.mockResolvedValue(accountProfile())
  mockedChangePassword.mockReset()
  mockedChangePassword.mockResolvedValue(undefined)
  // mockImplementation does not clear call history, and these assertions care
  // about who was *not* called.
  mockedDelete.mockReset()
  mockedWithdraw.mockReset()
  // Deletion is still a stub that rejects; withdrawal is real and answers with
  // the now-locked account, which is what moves the app to /consents.
  mockedDelete.mockImplementation(() =>
    Promise.reject(new PendingBackendError('DELETE /api/account/')),
  )
  mockedWithdraw.mockImplementation(() => Promise.resolve(LOCKED_USER))
})

/**
 * Mounts the screen and waits for the one request it makes.
 *
 * Every test here goes through this: the counters and the care card arrive over
 * the network now, so asserting on them straight after render would race the
 * fetch. An account that makes no request (a guardian) falls through at once,
 * since the loading line is never drawn for it.
 */
async function renderProfile(options: Parameters<typeof renderWithProviders>[1] = {}) {
  const result = renderWithProviders(<Profile />, options)
  await waitFor(() => expect(screen.queryByText('Wczytywanie…')).not.toBeInTheDocument())
  return result
}

/** Opens the "Twoje dane i zgody" path named by the button's label. */
async function open(label: string | RegExp) {
  await userEvent.click(screen.getByRole('button', { name: label }))
}

describe('Profile', () => {
  it('shows the signed-in account rather than a hardcoded example patient', async () => {
    await renderProfile({
      user: { ...TEST_USER, firstName: 'Jakub', lastName: 'Wojciechowski', email: 'jakub@wp.pl' },
    })

    expect(screen.getByRole('heading', { name: 'Jakub Wojciechowski' })).toBeInTheDocument()
    expect(screen.getByText('jakub@wp.pl')).toBeInTheDocument()
    // The initials are generated, not stored — and 'AK' belongs to the mockup.
    expect(screen.getByText('JW')).toBeInTheDocument()
    expect(screen.queryByText(/Anna Kowalska/)).not.toBeInTheDocument()
  })

  it('falls back to the e-mail when the account has no name, rather than an empty heading', async () => {
    await renderProfile({
      user: { ...TEST_USER, firstName: null, lastName: null, email: 'ktos@wp.pl' },
    })

    expect(screen.getByRole('heading', { name: 'ktos@wp.pl' })).toBeInTheDocument()
    expect(screen.getByText('K')).toBeInTheDocument()
  })

  it('shows two counters and not the mockup third one — techniques cannot be counted', async () => {
    await renderProfile()

    expect(screen.getByText('wpisów')).toBeInTheDocument()
    expect(screen.getByText('dni z rzędu')).toBeInTheDocument()
    expect(screen.queryByText('technik')).not.toBeInTheDocument()
  })

  it('takes both counters from the API rather than from the mockup patient', async () => {
    mockedProfile.mockResolvedValue(
      accountProfile({ activity: { entryCount: 137, streakDays: 2 } }),
    )

    await renderProfile()

    expect(screen.getByText('137')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // The figures that used to be hardcoded here, so a reverted wiring is loud.
    expect(screen.queryByText('8')).toBeNull()
    expect(screen.queryByText('6')).toBeNull()
  })

  it('says so when the activity fails to load, instead of showing zeroes', async () => {
    /** Zeroes would be a claim: "you have written nothing, you have no
     *  therapist". Both are statements about a patient's care. */
    mockedProfile.mockRejectedValue(new ApiError(500, null))

    await renderProfile()

    expect(screen.getByRole('alert')).toHaveTextContent(/Nie udało się wczytać/)
    expect(screen.queryByText('wpisów')).toBeNull()
    expect(screen.queryByText('OPIEKA')).toBeNull()
  })

  it('offers a way to ask again after a failure, and clears the failure on success', async () => {
    mockedProfile.mockRejectedValueOnce(new ApiError(500, null))

    await renderProfile()
    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('wpisów')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('names the specialist the API returned, and says so when there is none', async () => {
    mockedProfile.mockResolvedValue(accountProfile({ care: null }))

    await renderProfile()

    // A nullable column and an ordinary state — an account registered before the
    // first appointment. Said in words, because a blank card under "OPIEKA"
    // reads as a screen that failed rather than as "nobody yet".
    expect(screen.getByText('OPIEKA')).toBeInTheDocument()
    expect(screen.getByText(/Nie masz jeszcze przypisanego specjalisty/)).toBeInTheDocument()
    expect(screen.queryByText('Terapeuta')).toBeNull()
  })

  it('offers nothing that disconnects the specialist — that is the specialist’s action', async () => {
    await renderProfile()

    expect(screen.getByText('mgr Marta Zielińska')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /odłącz|cofnij dostęp|odbierz dostęp/i })).toBeNull()
  })

  it('quotes both consents in the wording the registration form used', async () => {
    await renderProfile()

    for (const consent of CONSENTS) {
      expect(screen.getByText(consent.label)).toBeInTheDocument()
    }
  })

  it('tells deletion and withdrawal apart, because they no longer do the same thing', async () => {
    /** They used to share a screen *and* an outcome: losing the art. 9 consent
     *  was treated as ending the account. Withdrawal locks it now and removes
     *  nothing, so the list of consequences has to differ — showing "Co
     *  zostanie usunięte" over a reversible act would be a false statement on
     *  the one screen whose job is to be precise about consequences. */
    await renderProfile()

    await open('Usuń konto')
    expect(screen.getByRole('heading', { name: 'Co zostanie usunięte' })).toBeInTheDocument()

    await open('Anuluj')

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    expect(screen.getByRole('heading', { name: 'Co się stanie' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Co zostanie usunięte' })).toBeNull()
    expect(screen.getByText(/zostaje nietknięte/)).toBeInTheDocument()
  })

  it('withdraws both consents at once through its own path', async () => {
    await renderProfile()

    await open('Wycofaj obie zgody naraz')

    expect(screen.getByRole('heading', { name: 'Wycofaj obie zgody' })).toBeInTheDocument()
  })

  it('leaves the services-consent consequences open instead of inventing them', async () => {
    await renderProfile()

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])

    expect(screen.getByRole('heading', { name: 'Wycofaj zgodę na usługi' })).toBeInTheDocument()
    expect(screen.getByText(/Do ustalenia z Fundacją/)).toBeInTheDocument()
    // The one thing this screen must not do is claim the account survives — or
    // that it does not.
    expect(screen.queryByText(/Co zostanie usunięte/)).toBeNull()
  })

  it('never tells the user the account was deleted, because nothing was', async () => {
    await renderProfile()

    await open('Usuń konto')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Usuń konto na stałe')

    expect(await screen.findByText(PENDING_BACKEND_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText(/Twoje konto i dane są nietknięte/)).toBeInTheDocument()
  })

  it('asks for the password before confirming a closure', async () => {
    await renderProfile()

    await open('Usuń konto')
    await open('Usuń konto na stałe')

    expect(await screen.findByText('Podaj hasło.')).toBeInTheDocument()
    expect(screen.queryByText(PENDING_BACKEND_MESSAGE)).toBeNull()
  })

  it('offers no data export — it was removed from this screen', async () => {
    await renderProfile()

    expect(screen.queryByRole('button', { name: /pobierz moje dane/i })).toBeNull()
    expect(screen.queryByText(/eksport/i)).toBeNull()
  })

  it('validates the new e-mail with the same rule as registration', async () => {
    await renderProfile()

    await open('Zmień adres e-mail')
    await userEvent.type(screen.getByLabelText('Nowy adres e-mail'), 'nie-adres')
    await open('Zapisz nowy e-mail')

    expect(await screen.findByText('Podaj poprawny adres e-mail.')).toBeInTheDocument()
  })

  it('will not accept a new password shorter than the registration minimum', async () => {
    await renderProfile()

    await open('Zmień hasło')
    await userEvent.type(screen.getByLabelText('Obecne hasło'), 'stare-haslo')
    await userEvent.type(screen.getByLabelText('Nowe hasło'), 'krotkie')
    await userEvent.type(screen.getByLabelText('Powtórz nowe hasło'), 'krotkie')
    await open('Zapisz nowe hasło')

    expect(await screen.findByText('Hasło musi mieć co najmniej 8 znaków.')).toBeInTheDocument()
  })

  it('refuses two passwords that do not match, on the field that produced it', async () => {
    await renderProfile()

    await open('Zmień hasło')
    await userEvent.type(screen.getByLabelText('Obecne hasło'), 'stare-haslo')
    await userEvent.type(screen.getByLabelText('Nowe hasło'), 'nowe-haslo-1')
    await userEvent.type(screen.getByLabelText('Powtórz nowe hasło'), 'nowe-haslo-2')
    await open('Zapisz nowe hasło')

    expect(await screen.findByText('Hasła nie są identyczne.')).toBeInTheDocument()
  })

  it('signs out through the same path the header menu uses', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    await renderProfile({ signOut })

    // The header menu has one of its own, but only while it is open — closed, the
    // profile's own button is the only one on the screen.
    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    expect(signOut).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true })
  })

  it('sends the scope the entry point implies, not the one a screen guessed', async () => {
    await renderProfile()

    await open('Wycofaj obie zgody naraz')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgody')

    await waitFor(() => expect(mockedWithdraw).toHaveBeenCalledWith('all'))
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('withdrawing only the health-data consent sends scope "data"', async () => {
    await renderProfile()

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgodę')

    await waitFor(() => expect(mockedWithdraw).toHaveBeenCalledWith('data'))
  })

  it('withdrawing only the services consent sends scope "services"', async () => {
    await renderProfile()

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgodę na usługi')

    await waitFor(() => expect(mockedWithdraw).toHaveBeenCalledWith('services'))
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
    await renderProfile({ signOut })

    await open('Usuń konto')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Usuń konto na stałe')

    // The account is gone, so the only correct next step is to leave.
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }))
    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByText(/nietknięte/)).toBeNull()
    expect(screen.queryByText(PENDING_BACKEND_MESSAGE)).toBeNull()
  })

  it('hands the locked account to the session, which is what moves the app', async () => {
    /** No navigate() here on purpose: App.tsx's guard reads `consentsActive`
     *  and sends the account to /consents. A redirect issued from this screen
     *  as well could disagree with the guard that would have done it anyway. */
    const setUser = vi.fn()
    await renderProfile({ setUser })

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgodę na usługi')

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(LOCKED_USER))
  })

  it('does not sign the user out when a consent is withdrawn', async () => {
    /** The account still exists and its owner has to reach the screen offering
     *  the consents back — signing them out would put it behind a login they
     *  may not want to perform. Deletion is the one that ends the session. */
    const signOut = vi.fn().mockResolvedValue(undefined)
    await renderProfile({ signOut })

    await open('Wycofaj obie zgody naraz')
    await userEvent.type(screen.getByLabelText('Hasło'), 'haslo1234')
    await open('Wycofaj zgody')

    await waitFor(() => expect(mockedWithdraw).toHaveBeenCalled())
    expect(signOut).not.toHaveBeenCalled()
  })

  it('no longer describes withdrawal as ending the account', async () => {
    /** It locks it. Saying otherwise was the old model and would now be a false
     *  statement about a reversible act. */
    await renderProfile()

    await open('Wycofaj obie zgody naraz')

    expect(screen.getByText(/Twoje wpisy zostają na miejscu/)).toBeInTheDocument()
    expect(screen.queryByText(/Co zostanie usunięte/)).toBeNull()
    // getAllBy: the lead and the list both say it, which is the point.
    expect(screen.getAllByText(/przywrócić w każdej chwili|zostaje nietknięte/).length)
      .toBeGreaterThan(0)
  })

  it('names the confirmation screen to a screen reader by focusing its heading', async () => {
    await renderProfile()

    await open('Usuń konto')

    // The button that opened it has unmounted; without this, focus falls to <body>
    // and nothing announces that this is a destructive screen.
    expect(screen.getByRole('heading', { name: 'Usuń konto', level: 1 })).toHaveFocus()
  })
})

describe('Profile — an account that is not a clinical subject', () => {
  /**
   * A guardian gets no `patient` row at all, so the endpoint behind the counters
   * refuses them. Until this branch existed they were shown eight entries and a
   * therapist: a clinical record of somebody who has none.
   */
  const GUARDIAN = { ...TEST_USER, role: 'rodzic', isPatient: false, isChild: null }

  it('shows neither the counters nor the care card', async () => {
    await renderProfile({ user: GUARDIAN })

    expect(screen.queryByText('wpisów')).toBeNull()
    expect(screen.queryByText('dni z rzędu')).toBeNull()
    expect(screen.queryByText('OPIEKA')).toBeNull()
  })

  it('never makes the request, rather than making it and hiding the 403', async () => {
    await renderProfile({ user: GUARDIAN })

    expect(mockedProfile).not.toHaveBeenCalled()
  })

  it('still shows who they are, their consents and the way out', async () => {
    await renderProfile({ user: GUARDIAN })

    expect(screen.getByRole('heading', { name: 'Test Testowy' })).toBeInTheDocument()
    expect(screen.getByText('Twoje dane i zgody')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wyloguj' })).toBeInTheDocument()
  })
})

describe('Profile — the consent register', () => {
  it('shows the date this account actually consented, not one date for everybody', async () => {
    await renderProfile({
      user: { ...TEST_USER, dataConsentAt: '2026-03-09T21:15:00Z' },
    })

    // The moment is stored, the day is what a person reading their own profile
    // needs — art. 7(1) is about being able to prove it, not about printing it.
    expect(screen.getByText('Udzielona 9 marca 2026')).toBeInTheDocument()
  })

  it('says "Nieudzielona" for a consent that was never granted', async () => {
    /** A real state: registration writes both columns, but rows seeded by
     *  mock_data.sql have neither. */
    await renderProfile({ user: { ...TEST_USER, servicesConsentAt: null } })

    expect(screen.getByText('Nieudzielona')).toBeInTheDocument()
    // Nothing to withdraw when it was never given, so only one button is left.
    expect(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })).toHaveLength(1)
  })
})

describe('Profile — changing the password', () => {
  async function fillPasswordForm(current = 'StareHaslo123', next = 'NoweHaslo987') {
    await open('Zmień hasło')
    await userEvent.type(screen.getByLabelText('Obecne hasło'), current)
    await userEvent.type(screen.getByLabelText('Nowe hasło'), next)
    await userEvent.type(screen.getByLabelText('Powtórz nowe hasło'), next)
    await open('Zapisz nowe hasło')
  }

  it('sends all three fields, so the server can verify the current one', async () => {
    await renderProfile()

    await fillPasswordForm()

    expect(mockedChangePassword).toHaveBeenCalledWith({
      currentPassword: 'StareHaslo123',
      newPassword: 'NoweHaslo987',
      confirmNewPassword: 'NoweHaslo987',
    })
  })

  it('confirms the change rather than promising it for later', async () => {
    /** The screen used to say "zostanie zapisana po podłączeniu backendu" while
     *  sending nothing. It sends something now, so it must not still say that. */
    await renderProfile()

    await fillPasswordForm()

    expect(await screen.findByText(/Hasło zostało zmienione/)).toBeInTheDocument()
    expect(screen.queryByText(/po podłączeniu backendu/)).toBeNull()
  })

  it('places the server\'s verdict on the input that produced it', async () => {
    /** Django rejects things this form accepts — a password resembling the
     *  account's own e-mail, or a common one of twelve characters. */
    mockedChangePassword.mockRejectedValue(
      new ApiError(400, null, { current_password: 'Obecne hasło jest nieprawidłowe.' }),
    )
    await renderProfile()

    await fillPasswordForm()

    expect(await screen.findByText('Obecne hasło jest nieprawidłowe.')).toBeInTheDocument()
  })

  it('does not claim success when the request failed', async () => {
    mockedChangePassword.mockRejectedValue(new ApiError(500, 'Coś poszło nie tak.'))
    await renderProfile()

    await fillPasswordForm()

    expect(await screen.findByText('Coś poszło nie tak.')).toBeInTheDocument()
    expect(screen.queryByText(/Hasło zostało zmienione/)).toBeNull()
  })

  it('sends nothing when the two new passwords differ', async () => {
    await renderProfile()

    await open('Zmień hasło')
    await userEvent.type(screen.getByLabelText('Obecne hasło'), 'StareHaslo123')
    await userEvent.type(screen.getByLabelText('Nowe hasło'), 'NoweHaslo987')
    await userEvent.type(screen.getByLabelText('Powtórz nowe hasło'), 'InneHaslo987')
    await open('Zapisz nowe hasło')

    expect(await screen.findByText('Hasła nie są identyczne.')).toBeInTheDocument()
    expect(mockedChangePassword).not.toHaveBeenCalled()
  })
})
