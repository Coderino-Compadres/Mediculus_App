import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import DietProfile from './DietProfile'
import DietHome from './DietHome'
import DietReports from './DietReports'
import DietAnalysis from './DietAnalysis'
import HeaderMenu from '../components/HeaderMenu'
import Profile from './Profile'
import {
  CONDITIONS, emptyHealthProfile, formatMeasurement,
} from '../utils/healthProfile'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import type { AccountProfile } from '../types/profile'
import type { HealthProfileDraft, HealthProfileInput } from '../types/healthProfile'
import type { DietDay, DietJournalDay, HydrationDay } from '../types/diet'
import type { DietWeeklyReport } from '../types/dietReport'

/** The one request this screen actually makes — its own psychodietitian.
 *
 *  `fetchDietAccountProfile`, not `fetchAccountProfile`: since migration 0022
 *  the two profile screens ask different endpoints, because "who treats me" is
 *  a question per module and §13's card is the diet one. The mock keeps the old
 *  variable name so the assertions below still read about "the profile". */
const fetchAccountProfile = vi.fn<() => Promise<AccountProfile>>()
vi.mock('../api/profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/profile')>()
  return { ...actual, fetchDietAccountProfile: () => fetchAccountProfile() }
})

/**
 * The health profile's two requests.
 *
 * Mocked at the api layer rather than at `fetch`, which is what every other
 * screen's tests here do: the mapping between the payload and the draft has its
 * own tests (`api/healthProfile.ts` is exercised through `utils/healthProfile`),
 * and what this file is about is what the *screen* does with a resolved or
 * rejected promise — including the two failures a server can produce and a
 * stub never could.
 *
 * `beforeEach` gives them the behaviour a working backend has: a profile that
 * reads back what was saved.
 */
const fetchHealthProfile = vi.fn<() => Promise<HealthProfileDraft>>()
const saveHealthProfile =
  vi.fn<(input: HealthProfileInput) => Promise<HealthProfileDraft>>()
vi.mock('../api/healthProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/healthProfile')>()
  return {
    ...actual,
    fetchHealthProfile: () => fetchHealthProfile(),
    saveHealthProfile: (input: HealthProfileInput) => saveHealthProfile(input),
  }
})

/** The other module's screens, for the scope sentinel at the bottom. */
const fetchDietDay = vi.fn<() => Promise<DietDay>>()
const fetchHydration = vi.fn<() => Promise<HydrationDay>>()
const fetchDietReports = vi.fn<() => Promise<DietWeeklyReport[]>>()
const fetchDietHistory = vi.fn<() => Promise<DietJournalDay[]>>()
vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return {
    ...actual,
    fetchDietDay: () => fetchDietDay(),
    fetchHydration: () => fetchHydration(),
    fetchDietReports: () => fetchDietReports(),
    fetchDietHistory: () => fetchDietHistory(),
  }
})

/**
 * "Profil" in the diet module — §13.
 *
 * MOST OF WHAT IS PINNED HERE IS ABSENCE, and on this screen the absences are
 * the feature rather than a side effect of one. §13 rules out the progress bar
 * to a target mass, the "zostało X kg" counter and the weight chart by name,
 * and says why in the same breath: "Wśród pacjentek są osoby z zaburzeniami
 * odżywiania — te dwie liczby są danymi dla specjalisty, nie celem
 * pokazywanym codziennie." Every one of them is something a reasonable person
 * adds thinking it an improvement, which is why a comment in the source would
 * not be enough.
 *
 * The second group is honesty about what is stored. The fields hold what
 * `GET /api/account/health-profile/` returned and nothing else: empty when the
 * profile is empty, an error when the request failed, and never a body invented
 * for whoever opens the screen.
 */

function careProfile(specialist: string | null, approach: string | null = null): AccountProfile {
  return {
    activity: { entryCount: 0, streakDays: 0 },
    care: specialist === null ? null : { specialist, approach, phone: null },
  }
}

/**
 * What the server answers a save with: the profile as it was stored.
 *
 * A transcription of `core/health_profile.serialize_profile` into the draft the
 * client makes of it — trimmed text, measurements back as text, conditions in
 * §13's own order. Written out rather than echoing the input, because the
 * screen settling on the *stored* profile rather than on its own draft is one
 * of the things this file pins.
 */
function storedFrom(input: HealthProfileInput): HealthProfileDraft {
  const order = CONDITIONS.map((condition) => condition.id)
  return {
    heightCm: formatMeasurement(input.heightCm),
    weightKg: formatMeasurement(input.weightKg),
    targetWeightKg: formatMeasurement(input.targetWeightKg),
    activityLevel: input.activityLevel,
    allergies: input.allergies ?? '',
    intolerances: input.intolerances ?? '',
    dietaryPreferences: input.dietaryPreferences ?? '',
    conditions: [...input.conditions].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    ),
    ownConditions: [...input.ownConditions],
  }
}

/**
 * The consequences a confirmation screen is currently listing.
 *
 * Read out of the card under the given heading rather than off a constant, so
 * the assertions are about what a patient is actually shown.
 */
function consequenceList(heading: string): (string | null)[] {
  const card = screen.getByRole('heading', { name: heading }).closest('section')
  if (card === null) throw new Error(`Brak karty pod nagłówkiem: ${heading}`)
  return within(card).getAllByRole('listitem').map((li) => li.textContent)
}

/** Render, then wait both of the screen's loads out — the specialist card's
 *  and the health profile's. */
async function renderScreen(user = TEST_USER) {
  renderWithProviders(<DietProfile />, { user, route: ROUTES.dietProfile })
  await waitFor(() => expect(screen.queryByText('Wczytywanie…')).toBeNull())
  await waitFor(() => expect(screen.queryByText('Wczytywanie profilu…')).toBeNull())
}

beforeEach(() => {
  for (const mock of [
    fetchAccountProfile, fetchDietDay, fetchHydration, fetchDietReports, fetchDietHistory,
    fetchHealthProfile, saveHealthProfile,
  ]) {
    mock.mockReset()
  }
  fetchAccountProfile.mockResolvedValue(careProfile(null))
  // A patient who has filled nothing in, and a save that stores what it was
  // sent — which is what the endpoint does (`core/health_profile.py`).
  fetchHealthProfile.mockResolvedValue(emptyHealthProfile())
  saveHealthProfile.mockImplementation(async (input) => storedFrom(input))
  fetchDietDay.mockResolvedValue({ date: '2026-09-09', streakDays: 0, mealCount: 0, meals: [] })
  fetchHydration.mockResolvedValue({
    date: '2026-09-09',
    glassMl: 250, bottleMl: 500, targetGlasses: 8,
    minAmountMl: 10, maxAmountMl: 3000, maxDrinkName: 40,
    liquidMl: 0, glasses: 0, progress: 0, entries: [], week: [],
  })
  fetchDietReports.mockResolvedValue([])
  fetchDietHistory.mockResolvedValue([])
})

describe('the screen itself', () => {
  it('names the module and the screen the way the rest of the module does', async () => {
    await renderScreen()

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument()
  })

  it('offers the way back that /profile never had', async () => {
    /** Every other screen in this module carries the arrow; the psychotherapy
     *  profile has none, which is part of why sending a diet patient there was
     *  a one-way trip. */
    await renderScreen()

    expect(
      screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' }),
    ).toHaveAttribute('href', ROUTES.diet)
  })

  it('shows the signed-in account rather than an example patient', async () => {
    await renderScreen()

    expect(screen.getByRole('heading', { name: 'Test Testowy' })).toBeInTheDocument()
    expect(screen.getByText('test@wp.pl')).toBeInTheDocument()
    expect(screen.getByText('Pacjent')).toBeInTheDocument()
  })

  it('keeps the heading levels in order', async () => {
    await renderScreen()

    const levels = screen
      .getAllByRole('heading')
      .map((h) => Number(h.tagName.slice(1)))

    expect(levels[0]).toBe(1)
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1)
    }
  })
})

describe('the health fields hold what is stored and nothing else', () => {
  it('opens with every field blank when the profile is empty', async () => {
    /** Empty because the server said the profile is empty — the alternative to
     *  blank fields being invented ones, which is what src/data/profile.ts was
     *  and why it is gone. A height and a mass printed into somebody's own
     *  profile are a statement about that person's body. */
    await renderScreen()

    expect(screen.getByLabelText('Wzrost')).toHaveValue('')
    expect(screen.getByLabelText('Masa ciała')).toHaveValue('')
    expect(screen.getByLabelText('Masa docelowa')).toHaveValue('')
    expect(screen.getByLabelText('Alergie pokarmowe')).toHaveValue('')
    expect(screen.getByLabelText('Nietolerancje')).toHaveValue('')
    expect(screen.getByLabelText('Preferencje żywieniowe')).toHaveValue('')

    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('never carries the artboard\'s example values', async () => {
    await renderScreen()

    for (const invented of ['168', '71', '66', 'orzechy laskowe', 'laktoza', 'Anna Kowalska']) {
      expect(screen.queryByDisplayValue(invented)).toBeNull()
      expect(screen.queryByText(invented)).toBeNull()
    }
  })

  it('fills the fields with what the server holds', async () => {
    /** The measurements arrive as numbers and go into fields that hold text —
     *  with a Polish comma, and without the ',0' the NUMERIC column adds to a
     *  whole number. */
    fetchHealthProfile.mockResolvedValue({
      ...emptyHealthProfile(),
      heightCm: '168',
      weightKg: '71,5',
      allergies: 'orzechy laskowe',
      conditions: ['hashimoto'],
      ownConditions: ['Migrena'],
    })

    await renderScreen()

    expect(screen.getByLabelText('Wzrost')).toHaveValue('168')
    expect(screen.getByLabelText('Masa ciała')).toHaveValue('71,5')
    expect(screen.getByLabelText('Alergie pokarmowe')).toHaveValue('orzechy laskowe')
    expect(screen.getByRole('button', { name: 'Hashimoto', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Migrena')).toBeInTheDocument()
  })

  it('says the profile was saved, and only after the server said so', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '71')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Zapisano.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends the form as numbers and nulls rather than as typed text', async () => {
    /** The contract `toHealthProfileInput` states: a half-typed '71,' is 71,
     *  and an untouched field is null rather than 0 — a patient who has not
     *  filled in a weight has not weighed zero. */
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Wzrost'), '168')
    await userEvent.type(screen.getByLabelText('Masa ciała'), '71,5')
    await userEvent.type(screen.getByLabelText('Alergie pokarmowe'), '  orzechy  ')
    await userEvent.click(screen.getByRole('button', { name: 'Hashimoto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    await screen.findByRole('status')
    expect(saveHealthProfile).toHaveBeenCalledWith({
      heightCm: 168,
      weightKg: 71.5,
      targetWeightKg: null,
      activityLevel: null,
      allergies: 'orzechy',
      intolerances: null,
      dietaryPreferences: null,
      conditions: ['hashimoto'],
      ownConditions: [],
    })
  })

  it('settles on the profile the server stored, not on its own draft', async () => {
    /** The same thing DietSleepPanel does with its night: a form still showing
     *  what was typed can disagree with the record it just wrote. Here the
     *  visible difference is the trimmed text. */
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Alergie pokarmowe'), '  orzechy  ')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    await screen.findByRole('status')
    expect(screen.getByLabelText('Alergie pokarmowe')).toHaveValue('orzechy')
  })

  it('stops saying "Zapisano" the moment anything changes', async () => {
    /** The notice describes the last submit, and one keystroke later it is
     *  describing something else. */
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Wzrost'), '1')
    expect(screen.queryByText('Zapisano.')).toBeNull()
  })

  it('saves with every field left empty', async () => {
    /** §05's rule for the whole module: żadne pole nie blokuje zapisu. */
    await renderScreen()

    const save = screen.getByRole('button', { name: 'Zapisz profil' })
    expect(save).toBeEnabled()

    await userEvent.click(save)

    expect(await screen.findByRole('status')).toHaveTextContent('Zapisano.')
    expect(saveHealthProfile).toHaveBeenCalledWith(
      expect.objectContaining({ heightCm: null, conditions: [], ownConditions: [] }),
    )
  })
})

describe('a load that failed is not drawn as an empty profile', () => {
  /**
   * CLAUDE.md's rule, and the reason it costs more here than on a list: blank
   * health fields do not read as "we could not fetch this", they read as "you
   * have not filled anything in" — a statement about the reader. The first
   * thing somebody does about that is type their allergies in again, over the
   * top of the ones the server still holds.
   *
   * Reachable for real now that the fields come from a request: a dropped
   * connection, a 503, a session that expired between two screens.
   */
  it('says so, and does not render the fields it could not fill', async () => {
    fetchHealthProfile.mockRejectedValue(new Error('offline'))

    await renderScreen()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Nie udało się wczytać Twojego profilu/)
    // The distinction the whole test exists for, said in words.
    expect(alert).toHaveTextContent(/To nie znaczy, że jest pusty/)

    for (const label of ['Wzrost', 'Masa ciała', 'Alergie pokarmowe']) {
      expect(screen.queryByLabelText(label)).toBeNull()
    }
    expect(screen.queryByRole('button', { name: 'Zapisz profil' })).toBeNull()
  })

  it('offers a way to try again, and the fields come back when it works', async () => {
    /** The affordance `CareCard` already has through `useAccountProfile`'s
     *  `retry` — a sentence with nothing to press leaves reloading the page by
     *  hand as the only way to act on it. */
    fetchHealthProfile.mockRejectedValueOnce(new Error('offline'))
    fetchHealthProfile.mockResolvedValue(emptyHealthProfile())

    await renderScreen()
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByLabelText('Wzrost')).toHaveValue('')
    expect(screen.queryByText(/Nie udało się wczytać Twojego profilu/)).toBeNull()
    expect(fetchHealthProfile).toHaveBeenCalledTimes(2)
  })

  it('prefers the server\'s own sentence to this screen\'s', async () => {
    /** The module's convention — `ApiError.formMessage` first, the local
     *  wording only when the server said nothing usable. */
    fetchHealthProfile.mockRejectedValue(
      new ApiError(503, 'Profil jest chwilowo niedostępny.'),
    )

    await renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Profil jest chwilowo niedostępny.',
    )
    expect(screen.queryByText(/To nie znaczy, że jest pusty/)).toBeNull()
  })

  it('is ochre rather than red, like the rest of the module\'s consequences', async () => {
    /** dietProfile.css' own rule: red is the psychotherapy side's ink for an
     *  error and is reserved here for signing out and withdrawing a consent.
     *  Nothing legible depends on the colour — the wording and role="alert"
     *  carry the meaning (WCAG 1.4.1) — but the class must not drift back to
     *  the red one. */
    fetchHealthProfile.mockRejectedValue(new Error('offline'))

    await renderScreen()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('diet-profile-health-error')
    expect(alert).not.toHaveClass('diet-profile-error')
  })
})

describe('a save that failed is not silence', () => {
  /**
   * The bug this replaces: anything that was not a `PendingBackendError` was
   * re-thrown from inside the `.catch`, which produces a rejected promise
   * nothing handles — no error boundary sees it, it lands in the console, and
   * the patient is left with a re-enabled button and no sentence at all. A
   * lost save then looks exactly like one that worked, and what is lost is an
   * allergy somebody expects their dietitian to have read.
   */
  it('says the save did not go through', async () => {
    saveHealthProfile.mockRejectedValue(new Error('network'))

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Nie udało się zapisać profilu/)
    expect(alert).toHaveClass('diet-profile-health-error')
  })

  it('never says a lost save was stored', async () => {
    /** One state at a time, so the two claims cannot both be on screen: a
     *  "Zapisano" left standing over a failed request is the one thing this
     *  screen can least afford to say. */
    saveHealthProfile.mockRejectedValue(new Error('network'))

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Zapisano.')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps what was typed, so nobody has to write it twice', async () => {
    saveHealthProfile.mockRejectedValue(new Error('network'))

    await renderScreen()
    await userEvent.type(screen.getByLabelText('Alergie pokarmowe'), 'orzechy laskowe')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Alergie pokarmowe')).toHaveValue('orzechy laskowe')
    expect(screen.getByRole('button', { name: 'Zapisz profil' })).toBeEnabled()
  })

  it('prefers the server\'s own sentence to this screen\'s', async () => {
    saveHealthProfile.mockRejectedValue(
      new ApiError(400, 'Wzrost musi być liczbą centymetrów.'),
    )

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wzrost musi być liczbą centymetrów.',
    )
  })

  it('stops describing the last submit the moment anything changes', async () => {
    saveHealthProfile.mockRejectedValue(new Error('network'))

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Wzrost'), '1')

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leaves the alert behind once a retry works', async () => {
    /** The other half of the same rule: the notice describes the last submit,
     *  so a save that went through must not be read under a sentence saying one
     *  did not. */
    saveHealthProfile.mockRejectedValueOnce(new Error('network'))

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Zapisano.')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('age', () => {
  /** 'YYYY-MM-DD' for somebody whose birthday was yesterday, so the figure on
   *  screen is exactly `age` whenever the suite happens to run. */
  function bornAgedExactly(age: number): string {
    const date = new Date()
    date.setDate(date.getDate() - 1)
    date.setFullYear(date.getFullYear() - age)
    return date.toISOString().slice(0, 10)
  }

  it('is computed from the date of birth and cannot be edited', async () => {
    /** `date_of_birth` is read-only on the serializer, so an editable age would
     *  be a second source of truth for a number the server already holds. */
    await renderScreen({ ...TEST_USER, dateOfBirth: bornAgedExactly(25) })

    expect(screen.getByText('Wiek')).toBeInTheDocument()
    expect(screen.getByText('25 lat')).toBeInTheDocument()
    expect(screen.queryByLabelText('Wiek')).toBeNull()
  })

  it('declines the noun, rather than printing "lat" at every age', async () => {
    /**
     * The bug this replaces, in the screen *and* in the test that used to
     * build its expected string the same wrong way: a 32-year-old was shown
     * "32 lat". Polish takes the 2-4 form outside the teens, and this is the
     * reader's own age on their own profile.
     */
    await renderScreen({ ...TEST_USER, dateOfBirth: bornAgedExactly(32) })

    expect(screen.getByText('32 lata')).toBeInTheDocument()
    expect(screen.queryByText('32 lat')).toBeNull()
  })

  it('takes the singular for a first birthday', async () => {
    await renderScreen({ ...TEST_USER, dateOfBirth: bornAgedExactly(1) })

    expect(screen.getByText('1 rok')).toBeInTheDocument()
  })

  it('keeps the teens on the genitive, where Polish breaks the 2-4 rule', async () => {
    await renderScreen({ ...TEST_USER, dateOfBirth: bornAgedExactly(13) })

    expect(screen.getByText('13 lat')).toBeInTheDocument()
  })

  it('has no row at all when the account has no date of birth', async () => {
    /** A computed age with nothing to compute from would be a blank pretending
     *  to be a value. */
    await renderScreen({ ...TEST_USER, dateOfBirth: null })

    expect(screen.queryByText('Wiek')).toBeNull()
  })
})

describe('mass and target mass', () => {
  it('are two independent fields and both accept a decimal comma', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '71,5')
    await userEvent.type(screen.getByLabelText('Masa docelowa'), '66,2')

    expect(screen.getByLabelText('Masa ciała')).toHaveValue('71,5')
    expect(screen.getByLabelText('Masa docelowa')).toHaveValue('66,2')
  })

  it('may each be left empty on their own', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '71')

    expect(screen.getByLabelText('Masa docelowa')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Zapisz profil' })).toBeEnabled()
  })

  it('NEVER produce a third number on the screen', async () => {
    /**
     * The safeguard §13 asks for, stated as an assertion rather than as a
     * comment: filling both fields in must not make a gap, a remainder, a
     * percentage or a bar appear anywhere. 71 and 66 are the artboard's own
     * pair precisely because 5 is the number nothing may show.
     */
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '71')
    await userEvent.type(screen.getByLabelText('Masa docelowa'), '66')

    const numbers = (document.body.textContent ?? '').match(/\d+([.,]\d+)?/g) ?? []
    // The only figures on the screen are the ones that were typed and the age.
    expect(numbers).not.toContain('5')
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(document.querySelector('progress')).toBeNull()
    expect(document.querySelector('meter')).toBeNull()
  })

  it('asks gently about a value that cannot be a mass, and still saves', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '0')

    expect(screen.getByText(/Sprawdź, proszę, tę wagę/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz profil' })).toBeEnabled()
    // A request to check, never a failure.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses letters at the keyboard rather than scolding afterwards', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Wzrost'), '16a8')

    expect(screen.getByLabelText('Wzrost')).toHaveValue('168')
  })
})

describe('what this screen refuses to show', () => {
  /**
   * The sweep. Each of these is a line somebody would "complete" the screen
   * across, and §13 and §15 rule them out by name — the first group because
   * this module does not score a body, the second because it counts no food.
   */
  it('names no measure derived from the two masses', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '71')
    await userEvent.type(screen.getByLabelText('Masa docelowa'), '66')

    for (const forbidden of [
      /BMI/i, /%/, /zostało/i, /pozostało/i, /cel osiągnięty/i, /w normie/i,
      /schudn/i, /przytyj/i, /za dużo/i, /limit/i, /niezdrow/i,
    ]) {
      expect(document.body.textContent).not.toMatch(forbidden)
    }
  })

  it('counts no food, as nothing in this module does', async () => {
    await renderScreen()

    for (const forbidden of [/kcal/i, /kalori/i, /białk/i, /tłuszcz/i, /węglowodan/i]) {
      expect(document.body.textContent).not.toMatch(forbidden)
    }
  })

  it('draws no chart and keeps no history of a mass', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Masa ciała'), '71')

    expect(document.querySelector('svg')).toBeNull()
    for (const forbidden of [/histori/i, /wykres/i, /poprzedni/i, /wcześniej/i]) {
      expect(document.body.textContent).not.toMatch(forbidden)
    }
  })

  it('promises no link with the supplements list', async () => {
    /** §08's open question — "czy to jedno źródło danych, czy dwa osobne
     *  wpisy" — is not answered in markup. There is no medicine field here and
     *  no link in either direction; DietSupplements.test.tsx guards the other
     *  side of the same question. */
    await renderScreen()

    expect(screen.queryByText(/suplement/i)).toBeNull()
    expect(document.querySelector(`a[href="${ROUTES.dietSupplements}"]`)).toBeNull()
    expect(screen.queryByLabelText(/leki/i)).toBeNull()
  })

  it('offers no second specialist and no module dots', async () => {
    /** §13 draws two, tagged by module. `patient.id_specjalist` is a single FK
     *  and the specialization is free text, so neither can be expressed. */
    fetchAccountProfile.mockResolvedValue(careProfile('Katarzyna Nowak', 'psychodietetyk'))

    await renderScreen()

    expect(screen.getAllByText(/Nowak/)).toHaveLength(1)
    expect(screen.queryByText(/psychoterapeut/i)).toBeNull()
  })

  it('shows no date the account was created', async () => {
    /** The artboard's "konto od 3 marca". The API sends no creation date, so
     *  the line would have to be invented. */
    await renderScreen()

    expect(screen.queryByText(/konto od/i)).toBeNull()
  })

  it('offers no way to change a name or a date of birth', async () => {
    /** `UserSerializer` is `read_only_fields = fields`. */
    await renderScreen()

    expect(screen.queryByLabelText(/imię/i)).toBeNull()
    expect(screen.queryByLabelText(/nazwisko/i)).toBeNull()
    expect(screen.queryByLabelText(/data urodzenia/i)).toBeNull()
  })
})

describe('the eating fields', () => {
  it('take any words at all, because they are descriptive and not a dictionary', async () => {
    /** §13's own note — "Pola opisowe, nie słownikowe — pacjentka wpisuje
     *  własnymi słowami" — wins over the chips the same artboard draws:
     *  somebody allergic to something not on a list needs somewhere to write
     *  it down. */
    await renderScreen()

    const rare = 'seler naciowy i gorczyca'
    await userEvent.type(screen.getByLabelText('Alergie pokarmowe'), rare)

    expect(screen.getByLabelText('Alergie pokarmowe')).toHaveValue(rare)
  })

  it('are text boxes rather than a fixed set of choices', async () => {
    await renderScreen()

    for (const label of ['Alergie pokarmowe', 'Nietolerancje', 'Preferencje żywieniowe']) {
      expect(screen.getByLabelText(label).tagName).toBe('TEXTAREA')
    }
  })

  it('leaves each one optional, and marks none of them required', async () => {
    /** The screen used to say "Możesz zostawić puste" under every field; that
     *  copy was dropped in 02659e6. What has to stay true is the property the
     *  sentence was describing — nothing here is required, and nothing scolds a
     *  patient for an empty box. */
    await renderScreen()

    for (const label of ['Alergie pokarmowe', 'Nietolerancje', 'Preferencje żywieniowe']) {
      const field = screen.getByLabelText(label)

      expect(field).not.toBeRequired()
      expect(field).not.toHaveAttribute('aria-invalid', 'true')
    }
  })
})

describe('the conditions', () => {
  it('offers §13\'s seventeen as one group', async () => {
    await renderScreen()

    const group = screen.getByRole('group', { name: 'Jednostki chorobowe z listy' })

    expect(within(group).getAllByRole('button')).toHaveLength(CONDITIONS.length)
  })

  it('keeps the psychiatric ones in the same list as the somatic ones', async () => {
    await renderScreen()

    const group = screen.getByRole('group', { name: 'Jednostki chorobowe z listy' })

    for (const label of ['Cukrzyca typu 1', 'Zaburzenia odżywiania', 'Depresja', 'ADHD']) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('picks and unpicks, and says so to a screen reader', async () => {
    await renderScreen()

    const chip = screen.getByRole('button', { name: 'Hashimoto' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(chip)
    expect(screen.getByRole('button', { name: 'Hashimoto', pressed: true })).toBeInTheDocument()

    await userEvent.click(chip)
    expect(screen.getByRole('button', { name: 'Hashimoto', pressed: false })).toBeInTheDocument()
  })

  it('does not move a chip when it is picked', async () => {
    /** The B set's order, and the reason it beats the A set's float-to-top: a
     *  chip that jumps somewhere else the moment it is tapped takes the next
     *  tap with it. */
    await renderScreen()

    const group = screen.getByRole('group', { name: 'Jednostki chorobowe z listy' })
    const before = within(group).getAllByRole('button').map((b) => b.textContent)

    await userEvent.click(screen.getByRole('button', { name: 'Spektrum autyzmu' }))

    const after = within(group).getAllByRole('button').map((b) => b.textContent)
    expect(after.map((t) => t?.replace('✓', ''))).toEqual(before)
  })

  it('takes a condition that is not on the list', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Własna jednostka chorobowa'), 'Migrena przewlekła')
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj własną' }))

    expect(
      within(screen.getByRole('list', { name: 'Dopisane jednostki chorobowe' }))
        .getByText('Migrena przewlekła'),
    ).toBeInTheDocument()
    // The box is ready for the next one.
    expect(screen.getByLabelText('Własna jednostka chorobowa')).toHaveValue('')
  })

  it('labels the own-condition box visibly rather than with a placeholder', async () => {
    /** A placeholder disappears the moment somebody starts typing, which is
     *  exactly when they might need to check what the box was for. */
    await renderScreen()

    const field = screen.getByLabelText('Własna jednostka chorobowa')

    expect(field).not.toHaveAttribute('placeholder')
    expect(document.querySelector('label[for="diet-profile-own-condition"]')).toBeInTheDocument()
  })

  it('takes a dopisana condition back off again', async () => {
    await renderScreen()

    await userEvent.type(screen.getByLabelText('Własna jednostka chorobowa'), 'Migrena')
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj własną' }))
    await userEvent.click(screen.getByRole('button', { name: 'Usuń „Migrena”' }))

    expect(screen.queryByText('Migrena')).toBeNull()
  })
})

describe('the activity level', () => {
  it('starts unanswered and never guesses', async () => {
    await renderScreen()

    for (const label of ['niski', 'umiarkowany', 'wysoki']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('can be taken back, so a mis-tap is not permanent', async () => {
    await renderScreen()

    const chip = screen.getByRole('button', { name: 'umiarkowany' })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('holds one answer at a time', async () => {
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'niski' }))
    await userEvent.click(screen.getByRole('button', { name: 'wysoki' }))

    expect(screen.getByRole('button', { name: 'niski' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'wysoki' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('the specialist', () => {
  it('names them when there is one', async () => {
    fetchAccountProfile.mockResolvedValue(careProfile('Katarzyna Nowak', 'psychodietetyk'))

    await renderScreen()

    expect(screen.getByText('Katarzyna Nowak')).toBeInTheDocument()
    expect(screen.getByText('psychodietetyk')).toBeInTheDocument()
  })

  it('never calls them "Terapeuta", which is /profile\'s word and false here', async () => {
    /** The one relationship the schema holds is `patient.specjalist`, and
     *  nothing says whether that person is a psychotherapist, a dietitian or a
     *  psychodietitian. */
    fetchAccountProfile.mockResolvedValue(careProfile('Katarzyna Nowak', 'psychodietetyk'))

    await renderScreen()

    expect(screen.queryByText('Terapeuta')).toBeNull()
  })

  it('prints no empty detail line when the specialization is blank', async () => {
    /** An empty line under a name reads as a missing job title rather than an
     *  unfilled one. */
    fetchAccountProfile.mockResolvedValue(careProfile('Katarzyna Nowak', null))

    await renderScreen()

    expect(screen.getByText('Katarzyna Nowak')).toBeInTheDocument()
    expect(document.querySelector('.diet-profile-care-detail')).toBeNull()
    // And it is care, not an absence of it.
    expect(screen.queryByText(/Nie masz jeszcze przypisanego specjalisty/)).toBeNull()
  })

  it('says so in words when nobody is assigned', async () => {
    fetchAccountProfile.mockResolvedValue(careProfile(null))

    await renderScreen()

    expect(screen.getByText(/Nie masz jeszcze przypisanego specjalisty/)).toBeInTheDocument()
  })

  it('reports a failed load instead of drawing it as "no specialist"', async () => {
    /** A failed request and an unassigned account are different facts, and
     *  rendering the absence silently would turn the first into the second. */
    fetchAccountProfile.mockRejectedValue(new Error('offline'))

    await renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Nie udało się wczytać danych o specjaliście/,
    )
    expect(screen.queryByText(/Nie masz jeszcze przypisanego specjalisty/)).toBeNull()
  })
})

describe('the account sections are the same ones /profile has', () => {
  it('renders the consent register with both consents quoted', async () => {
    await renderScreen()

    expect(screen.getByRole('heading', { name: 'Twoje dane i zgody' })).toBeInTheDocument()
    expect(screen.getByText(/w tym danych o zdrowiu, w aplikacji Mediculus/)).toBeInTheDocument()
    expect(screen.getByText(/korzystanie z usług Fundacji Mediculus/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })).toHaveLength(2)
  })

  it('renders the e-mail and password forms', async () => {
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Zmień hasło' }))
    expect(screen.getByLabelText('Obecne hasło')).toBeInTheDocument()
    expect(screen.getByLabelText('Nowe hasło')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Zmień adres e-mail' }))
    expect(screen.getByLabelText('Nowy adres e-mail')).toBeInTheDocument()
  })

  it('offers the same account sections as /profile, by the same names', async () => {
    /** Not a copy of the markup — literally the same components. If these
     *  headings ever diverge, one of the two screens has grown its own. */
    const headings = ['Twoje dane i zgody', 'Usunięcie konta']
    // The two account forms are collapsed, so their titles are the toggles.
    const toggles = ['Zmień adres e-mail', 'Zmień hasło']

    await renderScreen()
    for (const name of headings) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    for (const name of toggles) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }

    // And the same on the psychotherapy screen, because they are the same
    // components rather than a copy of them.
    renderWithProviders(<Profile />, { route: ROUTES.profile })
    await waitFor(() => expect(screen.queryAllByText('Wczytywanie…')).toHaveLength(0))
    for (const name of headings) {
      expect(screen.getAllByRole('heading', { name }).length).toBeGreaterThan(1)
    }
    for (const name of toggles) {
      expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(1)
    }
  })

  it('signs out', async () => {
    await renderScreen()

    expect(screen.getAllByRole('button', { name: 'Wyloguj' }).length).toBeGreaterThan(0)
  })
})

describe('the confirmation screens opened from here', () => {
  it('carries the diet nadtytuł, not PSYCHOTERAPIA', async () => {
    /** The bug this pins: ProfileConfirmLayout had the psychotherapy label
     *  hardcoded, so withdrawing a consent from this screen showed the other
     *  module's name on the screen that takes the decision. */
    await renderScreen()

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.queryByText('PSYCHOTERAPIA')).toBeNull()
  })

  it('carries it on the services-consent screen too', async () => {
    await renderScreen()

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[1])

    expect(screen.getByRole('heading', { name: 'Wycofaj zgodę na usługi' })).toBeInTheDocument()
    expect(screen.queryByText('PSYCHOTERAPIA')).toBeNull()
  })

  it('carries it on the deletion screen', async () => {
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto' }))

    expect(screen.getByRole('heading', { name: 'Co zostanie usunięte' })).toBeInTheDocument()
    expect(screen.queryByText('PSYCHOTERAPIA')).toBeNull()
  })

  it('lists the data of BOTH modules among what deletion removes', async () => {
    /**
     * One account, one deletion. The list named the psychotherapy diary and its
     * reports and stopped there — complete when it was written, and quietly
     * false five tables later. This is the one place in the app where somebody
     * is told what happens to their health data, and they decide on it.
     */
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto' }))
    const listed = document.body.textContent ?? ''

    for (const required of [
      /dzienniczku żywieniowym/, /posiłki/, /nawodnienie/i, /suplement/i,
      /sen/i, /aktywność/i, /dietetycznej/i,
    ]) {
      expect(listed).toMatch(required)
    }
    // And still everything it named before.
    expect(listed).toMatch(/ocenami nastroju/)
    expect(listed).toMatch(/imię, nazwisko, adres e-mail/)
  })

  it('lists exactly the same things whichever profile it was opened from', async () => {
    /**
     * Confirmed by the team on the backend's side: deleting the account from
     * anywhere deletes everything, and the scope does not depend on which
     * profile the screen was opened from. So the consequences are one list,
     * and the only thing allowed to differ between the two entry points is the
     * nadtytuł saying where the reader is standing.
     *
     * This test is what stops the list quietly becoming per-module later —
     * filtered by route, keyed on `moduleLabel`, or split in two. Any of those
     * would word the consequences to match the door somebody came through,
     * describing a narrower deletion than the one that happens, on the screen
     * where they agree to it.
     */
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto' }))
    const fromDiet = consequenceList('Co zostanie usunięte')
    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()

    cleanup()

    renderWithProviders(<Profile />, { route: ROUTES.profile })
    await waitFor(() => expect(screen.queryAllByText('Wczytywanie…')).toHaveLength(0))
    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto' }))
    const fromPsychotherapy = consequenceList('Co zostanie usunięte')

    // Item for item, in the same order — not merely the same length.
    expect(fromDiet).toEqual(fromPsychotherapy)
    expect(fromDiet.length).toBeGreaterThan(0)

    // And the one thing that is allowed to differ, differing.
    expect(screen.getByText('PSYCHOTERAPIA')).toBeInTheDocument()
    expect(screen.queryByText('DIETETYKA I PSYCHODIETETYKA')).toBeNull()
  })

  it('names both modules among what a withdrawal stops', async () => {
    /**
     * One account, one gate: `HasActiveConsents` refuses every endpoint behind
     * it and both modules are behind it, so withdrawing a consent stops the
     * whole app rather than the half the reader is standing in.
     *
     * The line this pins used to read "dzienniczek, raporty i analiza
     * przestają się otwierać" — and each of those three words now names a
     * screen in *each* module, so a patient recognised her own half and had no
     * reason to think the other was included. On a consequences screen that
     * ambiguity costs the same as an omission.
     */
    await renderScreen()

    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    const listed = consequenceList('Co się stanie').join(' ')

    expect(listed).toMatch(/część psychoterapeutyczna/i)
    expect(listed).toMatch(/część dietetyczna i psychodietetyczna/i)
    // And the two halves named by what is actually in them.
    expect(listed).toMatch(/dzienniczek emocji/i)
    expect(listed).toMatch(/dzienniczek żywieniowy/i)
    // Still true of both: nothing is removed, and it is reversible.
    expect(listed).toMatch(/zostaje nietknięte/)
    expect(listed).toMatch(/możesz przywrócić/)
  })

  it('stops the same things whichever profile the withdrawal was opened from', async () => {
    /** The same rule as the deletion list below: one list, never a per-module
     *  variant, and the nadtytuł is the only thing allowed to differ. */
    await renderScreen()
    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    const fromDiet = consequenceList('Co się stanie')
    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()

    cleanup()

    renderWithProviders(<Profile />, { route: ROUTES.profile })
    await waitFor(() => expect(screen.queryAllByText('Wczytywanie…')).toHaveLength(0))
    await userEvent.click(screen.getAllByRole('button', { name: 'Wycofaj tę zgodę' })[0])
    const fromPsychotherapy = consequenceList('Co się stanie')

    expect(fromDiet).toEqual(fromPsychotherapy)
    expect(fromDiet.length).toBeGreaterThan(0)

    expect(screen.getByText('PSYCHOTERAPIA')).toBeInTheDocument()
    expect(screen.queryByText('DIETETYKA I PSYCHODIETETYKA')).toBeNull()
  })

  it('goes back to the profile, not to the other module', async () => {
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument()
    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
  })
})

describe('the menu', () => {
  it('leads to the diet profile rather than the psychotherapy one', async () => {
    renderWithProviders(<HeaderMenu />, { route: ROUTES.diet })
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute(
      'href', ROUTES.dietProfile,
    )
  })

  it('stays the diet menu once you are on the diet profile', async () => {
    /** The bug this replaced: /profile is not under /diet, so `isDietRoute`
     *  said no, the menu swapped itself back to the psychotherapy list and the
     *  patient lost the module they were standing in. */
    renderWithProviders(<HeaderMenu />, { route: ROUTES.dietProfile })
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('link', { name: 'Dzienniczki żywieniowe' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Przejdź do części psychoterapeutycznej' }),
    ).toBeInTheDocument()
    for (const href of [ROUTES.journals, ROUTES.reports, ROUTES.analysis, ROUTES.techniques]) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull()
    }
  })

  it('marks the profile as the page you are on', async () => {
    renderWithProviders(<HeaderMenu />, { route: ROUTES.dietProfile })
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('the wording is for two genders', () => {
  it('never uses a feminine ending without an alternative', async () => {
    /** The app's rule: impersonal where possible, and "-łaś lub -łeś" where
     *  not. A lone "-łaś" addresses half the patients. */
    await renderScreen()

    const text = document.body.textContent ?? ''
    for (const match of text.matchAll(/\w+łaś\b/g)) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 40)
      expect(after).toMatch(/\s+lub\s/)
    }
  })
})

describe('SCOPE SENTINEL: mass belongs to this screen and nowhere else', () => {
  /**
   * §13's condition for these two numbers existing at all: "Pole »docelowa masa
   * ciała« zostaje w profilu, bo specjalista go potrzebuje — ale nigdzie
   * indziej w aplikacji się nie pojawia. Nie ma go na stronie głównej, w
   * podsumowaniu dnia ani w raporcie."
   *
   * So this is not a test of the profile at all — it renders the module's other
   * screens and checks the words are absent from them. It will fail the day
   * somebody adds a weight tile to the home screen or a mass row to a report,
   * which is exactly when somebody needs to be stopped.
   */
  const forbidden = [/masa/i, /\bkg\b/i, /waga/i, /wagow/i, /wagi\b/i]

  it('says nothing about a mass on the module\'s home screen', async () => {
    renderWithProviders(<DietHome />, { route: ROUTES.diet })
    await waitFor(() => expect(fetchDietDay).toHaveBeenCalled())

    for (const word of forbidden) expect(document.body.textContent).not.toMatch(word)
  })

  it('says nothing about a mass in the reports', async () => {
    renderWithProviders(<DietReports />, { route: ROUTES.dietReports })
    await waitFor(() => expect(fetchDietReports).toHaveBeenCalled())

    for (const word of forbidden) expect(document.body.textContent).not.toMatch(word)
  })

  it('says nothing about a mass in the analysis', async () => {
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })
    await waitFor(() => expect(fetchDietHistory).toHaveBeenCalled())

    for (const word of forbidden) expect(document.body.textContent).not.toMatch(word)
  })
})
