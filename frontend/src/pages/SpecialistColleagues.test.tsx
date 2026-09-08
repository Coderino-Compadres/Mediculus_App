import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistColleagues from './SpecialistColleagues'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'

/**
 * "Konta specjalistów" — the screen that replaced "konto specjalisty" in the
 * registration form.
 *
 * Three things are worth pinning here and they are all about wording rather
 * than about wiring:
 *
 *   1. the password is shown once and the screen says so. Nothing can read it
 *      back (the row holds a hash), and there is no password reset in this
 *      deployment, so a screen that showed it quietly would be a screen that
 *      loses accounts;
 *   2. the new account grants no consents, and the screen says that too —
 *      otherwise "nie mogę się zalogować" has no visible answer;
 *   3. the roster carries no patients. A specialist's patients agreed to
 *      *them*, and a list of colleagues is where somebody would reasonably add
 *      a caseload column thinking it an improvement.
 */

// Partially mocked: COLLEAGUE_FIELDS is real data the screen reads, and a
// stubbed copy of it would let the field-error mapping drift out of step with
// the module it mirrors.
vi.mock('../api/specialist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/specialist')>()),
  fetchColleagues: vi.fn(),
  createColleague: vi.fn(),
}))
const { fetchColleagues, createColleague } = await import('../api/specialist')
const mockedList = vi.mocked(fetchColleagues)
const mockedCreate = vi.mocked(createColleague)

const SPECIALIST = {
  ...TEST_USER,
  id: 'aaaa-1111',
  role: 'specjalista',
  isPatient: false,
  isSpecialist: true,
  isChild: null,
}

const ME = {
  id: 'aaaa-1111',
  name: 'Test',
  surname: 'Testowy',
  email: 'test@wp.pl',
  specialization: 'DBT',
  createdAt: '2026-06-01T09:00:00+02:00',
  consentsActive: true,
}

const CREATED = {
  id: 'bbbb-2222',
  name: 'Anna',
  surname: 'Terapeutka',
  email: 'anna@wp.pl',
  specialization: 'psychoterapia poznawczo-behawioralna',
  createdAt: '2026-09-01T09:00:00+02:00',
  consentsActive: false,
}

beforeEach(() => {
  mockedList.mockReset()
  mockedCreate.mockReset()
  mockedList.mockResolvedValue([ME])
})

function renderScreen() {
  return renderWithProviders(<SpecialistColleagues />, {
    user: SPECIALIST, route: ROUTES.specialistColleagues,
  })
}

async function fillForm() {
  await userEvent.type(screen.getByLabelText('Imię'), 'Anna')
  await userEvent.type(screen.getByLabelText('Nazwisko'), 'Terapeutka')
  await userEvent.type(screen.getByLabelText(/adres e-mail/i), 'anna@wp.pl')
  await userEvent.type(screen.getByLabelText(/data urodzenia/i), '1985-02-01')
  await userEvent.type(screen.getByLabelText(/specjalizacja/i), 'psychoterapia')
}

describe('SpecialistColleagues — what the screen says before anything is typed', () => {
  it('says the account cannot be created from the registration form', async () => {
    renderScreen()

    expect(
      await screen.findByText(/nie da się go utworzyć\s+w formularzu rejestracji/i),
    ).toBeInTheDocument()
  })

  it('asks for the five things the backend requires', async () => {
    renderScreen()

    await screen.findByLabelText('Imię')
    for (const label of [
      'Imię', 'Nazwisko', /adres e-mail/i, /data urodzenia/i, /specjalizacja/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('does not ask for a password — the account gets a generated one', async () => {
    renderScreen()

    await screen.findByLabelText('Imię')
    expect(screen.queryByLabelText(/hasło/i)).not.toBeInTheDocument()
  })

  it('keeps the button unusable until every field is answered', async () => {
    renderScreen()

    await screen.findByLabelText('Imię')
    const submit = screen.getByRole('button', { name: /utwórz konto specjalisty/i })
    expect(submit).toBeDisabled()

    await fillForm()

    expect(submit).toBeEnabled()
  })
})

describe('SpecialistColleagues — an account that gets created', () => {
  it('shows the password once and says it will not be shown again', async () => {
    mockedCreate.mockResolvedValue({ password: 'ABCD-EFGH-JKMN-PQRT', specialist: CREATED })
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    expect(await screen.findByText('ABCD-EFGH-JKMN-PQRT')).toBeInTheDocument()
    expect(screen.getByText(/nie zobaczysz go ponownie/i)).toBeInTheDocument()
  })

  it('says the new account grants its own consents at first login', async () => {
    // Nobody can tick those boxes for them (RODO art. 7), so the specialist
    // handing the password over has to know the account starts locked.
    mockedCreate.mockResolvedValue({ password: 'ABCD-EFGH-JKMN-PQRT', specialist: CREATED })
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    expect(await screen.findByText(/udziela zgód RODO/i)).toBeInTheDocument()
  })

  it('says the password it just handed over is meant to stop working', async () => {
    // A fact about the credential the specialist is writing down: they will know
    // it, so the account replaces it before the panel opens
    // (pages/PasswordChangeRequired.tsx). Saying so is what stops the note being
    // treated as a lasting password.
    mockedCreate.mockResolvedValue({ password: 'ABCD-EFGH-JKMN-PQRT', specialist: CREATED })
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    expect(await screen.findByText(/a potem ustawia własne hasło/i)).toBeInTheDocument()
    expect(screen.getByText(/panel pozostaje zamknięty/i)).toBeInTheDocument()
  })

  it('names the address the new specialist logs in with', async () => {
    mockedCreate.mockResolvedValue({ password: 'ABCD-EFGH-JKMN-PQRT', specialist: CREATED })
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    // Twice over — in the note above and in the roster row below — which is
    // deliberate: the address is half of what the new specialist needs.
    expect(await screen.findAllByText('anna@wp.pl')).toHaveLength(2)
  })

  it('adds the account to the roster without asking the server again', async () => {
    mockedCreate.mockResolvedValue({ password: 'ABCD-EFGH-JKMN-PQRT', specialist: CREATED })
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    expect(await screen.findAllByText(/Anna Terapeutka/)).not.toHaveLength(0)
    expect(screen.getByText(/psychoterapia poznawczo-behawioralna/)).toBeInTheDocument()
    expect(mockedList).toHaveBeenCalledTimes(1)
  })

  it('empties the form, so the next account is not a copy of the last', async () => {
    mockedCreate.mockResolvedValue({ password: 'ABCD-EFGH-JKMN-PQRT', specialist: CREATED })
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    await waitFor(() => expect(screen.getByLabelText('Imię')).toHaveValue(''))
    expect(screen.getByLabelText(/adres e-mail/i)).toHaveValue('')
  })
})

describe('SpecialistColleagues — when it is refused', () => {
  it('puts a taken address under the address box', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(400, null, { email: 'Konto z tym adresem e-mail już istnieje.' }),
    )
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    expect(await screen.findByText(/już istnieje/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/adres e-mail/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows no password when nothing was created', async () => {
    mockedCreate.mockRejectedValue(new ApiError(400, null, { email: 'Zajęty.' }))
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    await screen.findByText('Zajęty.')
    expect(screen.queryByText(/hasło tymczasowe/i)).not.toBeInTheDocument()
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    mockedCreate.mockRejectedValue(new Error('offline'))
    renderScreen()

    await screen.findByLabelText('Imię')
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /utwórz konto specjalisty/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nie udało się utworzyć konta/i)
  })

  it('never lets a failed load look like an empty roster', async () => {
    mockedList.mockRejectedValue(new Error('offline'))
    renderScreen()

    expect(await screen.findByText(/nie udało się wczytać listy/i)).toBeInTheDocument()
    expect(screen.queryByText(/nie ma jeszcze żadnych kont/i)).not.toBeInTheDocument()
  })
})

describe('SpecialistColleagues — the roster', () => {
  it('marks which account is the one signed in', async () => {
    renderScreen()

    expect(await screen.findByText(/to Ty/)).toBeInTheDocument()
  })

  it('says an account is still waiting for its owner rather than showing nothing', async () => {
    mockedList.mockResolvedValue([CREATED, ME])
    renderScreen()

    expect(
      await screen.findByText(/czeka na pierwsze logowanie: zgody RODO i własne hasło/i),
    ).toBeInTheDocument()
  })

  it('says out loud that it holds no patients', async () => {
    renderScreen()

    expect(await screen.findByText(/nie widzisz tu pacjentów innych/i)).toBeInTheDocument()
  })

  it('links back to the panel', async () => {
    renderScreen()

    expect(await screen.findByRole('link', { name: /wróć do panelu/i })).toHaveAttribute(
      'href', ROUTES.specialistHome,
    )
  })
})
