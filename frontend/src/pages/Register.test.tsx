import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import Register from './Register'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import { ACCOUNT_TYPES } from '../api/auth'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

// Keep the real module: the screen imports ACCOUNT_TYPES and REGISTER_FIELDS too.
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  register: vi.fn(),
}))
const { register } = await import('../api/auth')
const mockedRegister = vi.mocked(register)

/** A date of birth `years` years and a day before today, in the input's format. */
function bornYearsAgo(years: number): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  date.setDate(date.getDate() - 1)
  return date.toISOString().slice(0, 10)
}

const ADULT_DOB = bornYearsAgo(30)
const MINOR_DOB = bornYearsAgo(14)

function renderScreen(setUser = vi.fn()) {
  const result = renderWithProviders(<Register />, {
    user: null, setUser, route: ROUTES.register,
  })
  return { ...result, setUser }
}

const accountType = () => screen.getByLabelText(/rodzaj konta/i)
const firstName = () => screen.getByLabelText('Imię')
const lastName = () => screen.getByLabelText('Nazwisko')
const dateOfBirth = () => screen.getByLabelText(/data urodzenia/i)
const email = () => screen.getByLabelText(/adres e-mail/i)
const password = () => screen.getByLabelText('Hasło')
const confirmPassword = () => screen.getByLabelText('Powtórz hasło')
const dataConsent = () => screen.getByRole('checkbox', { name: /danych osobowych/i })
const servicesConsent = () => screen.getByRole('checkbox', { name: /usług Fundacji/i })
const submitButton = () => screen.getByRole('button', { name: /załóż konto/i })

interface FormValues {
  type?: string
  dob?: string
  pass?: string
  confirm?: string
  mail?: string
  consents?: boolean
}

async function fillForm({
  type = ACCOUNT_TYPES.patient,
  dob = ADULT_DOB,
  pass = 'TajneHaslo123',
  confirm,
  mail = 'jan@example.com',
  consents = true,
}: FormValues = {}) {
  await userEvent.selectOptions(accountType(), type)
  await userEvent.type(firstName(), 'Jan')
  await userEvent.type(lastName(), 'Testowy')
  await userEvent.type(dateOfBirth(), dob)
  await userEvent.type(email(), mail)
  await userEvent.type(password(), pass)
  await userEvent.type(confirmPassword(), confirm ?? pass)
  if (consents) {
    await userEvent.click(dataConsent())
    await userEvent.click(servicesConsent())
  }
}

beforeEach(() => {
  navigate.mockReset()
  mockedRegister.mockReset()
})

describe('Register — what the form asks for', () => {
  it('offers exactly the three account types the backend knows', () => {
    renderScreen()

    const values = Array.from(
      accountType().querySelectorAll('option'),
    ).map((option) => (option as HTMLOptionElement).value).filter(Boolean)

    expect(values).toEqual([
      ACCOUNT_TYPES.patient, ACCOUNT_TYPES.minorPatient, ACCOUNT_TYPES.parent,
    ])
  })

  it('starts with nothing chosen, so the type is a deliberate answer', () => {
    renderScreen()

    expect(accountType()).toHaveValue('')
  })

  it('starts with both consents unticked — a pre-ticked box is not consent', () => {
    renderScreen()

    expect(dataConsent()).not.toBeChecked()
    expect(servicesConsent()).not.toBeChecked()
  })

  it('will not let the date picker offer a day that has not happened', () => {
    renderScreen()

    expect(dateOfBirth()).toHaveAttribute('max', new Date().toISOString().slice(0, 10))
  })

  it('asks the browser for a new password rather than the saved one', () => {
    renderScreen()

    expect(password()).toHaveAttribute('autocomplete', 'new-password')
    expect(confirmPassword()).toHaveAttribute('autocomplete', 'new-password')
  })
})

describe('Register — checks before anything is sent', () => {
  it('refuses an empty form and names every missing answer', async () => {
    renderScreen()

    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByText(/wybierz rodzaj konta/i)).toBeInTheDocument()
    expect(screen.getByText(/podaj imię/i)).toBeInTheDocument()
    expect(screen.getByText(/podaj nazwisko/i)).toBeInTheDocument()
    expect(screen.getByText(/podaj datę urodzenia/i)).toBeInTheDocument()
    expect(screen.getByText(/podaj adres e-mail/i)).toBeInTheDocument()
  })

  it('refuses a password the two boxes disagree about', async () => {
    renderScreen()

    await fillForm({ pass: 'TajneHaslo123', confirm: 'InneHaslo123' })
    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByText(/hasła nie są identyczne/i)).toBeInTheDocument()
  })

  it('refuses a password shorter than the backend would accept', async () => {
    renderScreen()

    await fillForm({ pass: 'Krotkie' })
    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByText(/co najmniej 8 znaków/i)).toBeInTheDocument()
  })

  it('refuses to submit without the data-processing consent', async () => {
    renderScreen()

    await fillForm({ consents: false })
    await userEvent.click(servicesConsent())
    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByText(/zgoda na przetwarzanie danych jest wymagana/i))
      .toBeInTheDocument()
  })

  it('refuses to submit without the services consent', async () => {
    renderScreen()

    await fillForm({ consents: false })
    await userEvent.click(dataConsent())
    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByText(/zgoda na usługi fundacji jest wymagana/i))
      .toBeInTheDocument()
  })

  it('marks the consent that is missing, next to the box itself', async () => {
    renderScreen()

    await fillForm({ consents: false })
    await userEvent.click(submitButton())

    await waitFor(() => expect(dataConsent()).toHaveAttribute('aria-invalid', 'true'))
    expect(servicesConsent()).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Register — the account type has to agree with the date of birth', () => {
  /**
   * Mirrors `_check_age_matches_account_type` in core/serializers.py. The point
   * of checking here as well is not security — the backend decides — but that
   * `patient.is_child` and `user.date_of_birth` must never be allowed to
   * contradict each other, and being told so before the round trip is kinder.
   *
   * It is reported above the form because the conflict belongs to the pair: a
   * message under either input alone would blame an answer that may well be the
   * right one.
   */

  it('refuses an adult account with a minor’s date', async () => {
    renderScreen()

    await fillForm({ type: ACCOUNT_TYPES.patient, dob: MINOR_DOB })
    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/niepełnoletnią/i)
  })

  it('refuses a minor account with an adult’s date', async () => {
    renderScreen()

    await fillForm({ type: ACCOUNT_TYPES.minorPatient, dob: ADULT_DOB })
    await userEvent.click(submitButton())

    expect(mockedRegister).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/pełnoletnią/i)
  })

  it('blames the pair rather than either input', async () => {
    renderScreen()

    await fillForm({ type: ACCOUNT_TYPES.patient, dob: MINOR_DOB })
    await userEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(accountType()).toHaveAttribute('aria-invalid', 'false')
    expect(dateOfBirth()).toHaveAttribute('aria-invalid', 'false')
  })

  it('lets a minor register a minor’s account', async () => {
    mockedRegister.mockResolvedValue(TEST_USER)
    renderScreen()

    await fillForm({ type: ACCOUNT_TYPES.minorPatient, dob: MINOR_DOB })
    await userEvent.click(submitButton())

    await waitFor(() => expect(mockedRegister).toHaveBeenCalled())
  })

  it('does not age-check a guardian at all', async () => {
    /** A guardian is not a clinical subject, so their age decides nothing. */
    mockedRegister.mockResolvedValue(TEST_USER)
    renderScreen()

    await fillForm({ type: ACCOUNT_TYPES.parent, dob: MINOR_DOB })
    await userEvent.click(submitButton())

    await waitFor(() => expect(mockedRegister).toHaveBeenCalled())
  })

  it('says nothing about the conflict while the date itself is still missing', async () => {
    /** Otherwise the alert would contradict the "podaj datę urodzenia" below it. */
    renderScreen()

    await userEvent.selectOptions(accountType(), ACCOUNT_TYPES.minorPatient)
    await userEvent.click(submitButton())

    expect(await screen.findByText(/podaj datę urodzenia/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Register — an account that gets created', () => {
  it('sends every answer, consents included', async () => {
    mockedRegister.mockResolvedValue(TEST_USER)
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    await waitFor(() => expect(mockedRegister).toHaveBeenCalledWith({
      accountType: ACCOUNT_TYPES.patient,
      firstName: 'Jan',
      lastName: 'Testowy',
      dateOfBirth: ADULT_DOB,
      email: 'jan@example.com',
      password: 'TajneHaslo123',
      confirmPassword: 'TajneHaslo123',
      dataConsent: true,
      servicesConsent: true,
    }))
  })

  it('opens the session from the answer instead of asking who we are', async () => {
    /** The backend logs the new account in as part of registering it. */
    mockedRegister.mockResolvedValue(TEST_USER)
    const { setUser } = renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(TEST_USER))
  })

  it('replaces the form in history so back does not return to it', async () => {
    mockedRegister.mockResolvedValue(TEST_USER)
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }))
  })

  it('locks the form while the account is being created', async () => {
    let release: (user: typeof TEST_USER) => void = () => {}
    mockedRegister.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('button', { name: /tworzenie konta…/i })).toBeDisabled()
    expect(email()).toBeDisabled()

    release(TEST_USER)
  })

  it('does not create two accounts on a double click', async () => {
    let release: (user: typeof TEST_USER) => void = () => {}
    mockedRegister.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())
    await userEvent.click(screen.getByRole('button', { name: /tworzenie konta…/i }))

    expect(mockedRegister).toHaveBeenCalledTimes(1)
    release(TEST_USER)
  })
})

describe('Register — the server’s verdict lands where it belongs', () => {
  /**
   * REGISTER_FIELDS is the map from the API's snake_case names to this form's
   * camelCase inputs. It is unit-tested in api/auth.test.ts; these are the tests
   * that it is actually wired up, so a Django error arrives under the input that
   * produced it instead of as a generic message nobody can act on.
   */

  it('puts a taken address under the address box', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, null, { email: 'Konto z tym adresem e-mail już istnieje.' }),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByText(/już istnieje/i)).toBeInTheDocument()
    await waitFor(() => expect(email()).toHaveAttribute('aria-invalid', 'true'))
  })

  it('puts a rejected password under the password box, not the repeat box', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, null, { password: 'To hasło jest zbyt powszechne.' }),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByText(/zbyt powszechne/i)).toBeInTheDocument()
    await waitFor(() => expect(password()).toHaveAttribute('aria-invalid', 'true'))
    expect(confirmPassword()).toHaveAttribute('aria-invalid', 'false')
  })

  it('translates date_of_birth onto the date input', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, null, { date_of_birth: 'Sprawdź datę urodzenia.' }),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByText(/sprawdź datę urodzenia/i)).toBeInTheDocument()
    await waitFor(() => expect(dateOfBirth()).toHaveAttribute('aria-invalid', 'true'))
  })

  it('translates a consent error onto its checkbox', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, null, { data_consent: 'Zgoda jest wymagana.' }),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByText('Zgoda jest wymagana.')).toBeInTheDocument()
    await waitFor(() => expect(dataConsent()).toHaveAttribute('aria-invalid', 'true'))
  })

  it('shows an error about the request as a whole above the form', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, 'Podana data urodzenia oznacza osobę niepełnoletnią.'),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/niepełnoletnią/i)
  })

  it('does not open a session when the account was not created', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, null, { email: 'Konto z tym adresem e-mail już istnieje.' }),
    )
    const { setUser } = renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    await screen.findByText(/już istnieje/i)
    expect(setUser).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('keeps every answer so only the rejected one has to be retyped', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(400, null, { email: 'Konto z tym adresem e-mail już istnieje.' }),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    await screen.findByText(/już istnieje/i)
    expect(firstName()).toHaveValue('Jan')
    expect(dateOfBirth()).toHaveValue(ADULT_DOB)
    expect(dataConsent()).toBeChecked()
  })

  it('explains a throttled attempt rather than blaming a field', async () => {
    mockedRegister.mockRejectedValue(
      new ApiError(429, 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'),
    )
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/zbyt wiele prób/i)
  })

  it('survives a failure that is not an ApiError at all', async () => {
    mockedRegister.mockRejectedValue(new TypeError('Failed to fetch'))
    renderScreen()

    await fillForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/coś poszło nie tak/i)
  })
})
