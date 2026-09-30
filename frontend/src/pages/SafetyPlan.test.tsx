import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import SafetyPlan from './SafetyPlan'
import { ROUTES } from '../routes'
import { CRISIS_LINES } from '../data/crisisLines'
import { ApiError } from '../api/client'
import { APP_DISCLAIMER } from '../utils/disclaimer'
import type { AccountProfile } from '../types/profile'
import type { SafetyPlan as Plan } from '../types/safetyPlan'

vi.mock('../api/profile', () => ({ fetchAccountProfile: vi.fn() }))
const { fetchAccountProfile } = await import('../api/profile')
const mockedProfile = vi.mocked(fetchAccountProfile)

vi.mock('../api/safetyPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/safetyPlan')>()
  return { ...actual, fetchSafetyPlan: vi.fn(), saveSafetyPlan: vi.fn() }
})
const { fetchSafetyPlan, saveSafetyPlan } = await import('../api/safetyPlan')
const mockedFetchPlan = vi.mocked(fetchSafetyPlan)
const mockedSavePlan = vi.mocked(saveSafetyPlan)

/** A plan the patient wrote, as `fetchSafetyPlan` maps it. */
const PLAN: Plan = {
  warningSigns: ['Nie śpię dwie noce z rzędu'],
  copingStrategies: ['Spacer'],
  trustedPeople: [
    { id: 'trusted-0', name: 'Ania', relation: 'siostra', phone: { dial: '600700800', display: '600 700 800' } },
  ],
  alternativeContact: null,
  notes: null,
  updatedAt: '2026-09-30T10:00:00Z',
}

/** The care relationship this screen names under "Kontakt do terapeuty". */
const ACCOUNT_PROFILE: AccountProfile = {
  activity: { entryCount: 8, streakDays: 6 },
  care: { specialist: 'mgr Marta Zielińska', approach: 'CBT / DBT', phone: null },
}

beforeEach(() => {
  mockedProfile.mockReset()
  mockedProfile.mockResolvedValue(ACCOUNT_PROFILE)
  mockedFetchPlan.mockReset()
  mockedFetchPlan.mockResolvedValue(PLAN)
  mockedSavePlan.mockReset()
})

/**
 * The screen itself: what it is composed of and in what order.
 *
 * The plan is the patient's own, loaded from and saved to /api/safety-plan/
 * (mocked here). How a filled plan and the empty card look is covered in
 * components/SafetyPlanView.test.tsx; this file covers the page: the order,
 * the load states, and writing and editing a plan.
 */
function renderScreen() {
  return renderWithProviders(<SafetyPlan />, { route: ROUTES.safetyPlan })
}

/** …and waits for the therapist's name, which arrives over the network. */
async function renderScreenWithCare() {
  const result = renderScreen()
  await waitFor(() => expect(mockedProfile).toHaveBeenCalled())
  return result
}

describe('SafetyPlan', () => {
  it('is headed as the psychotherapy module, like every other screen in it', () => {
    renderScreen()

    expect(screen.getByText('PSYCHOTERAPIA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Plan bezpieczeństwa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument()
  })

  it('puts the support numbers first, before anything conditional', () => {
    /** They are the one part of this screen that works today and the one part
     *  that is true for every account — including the majority with no plan. So
     *  they are on screen without scrolling. */
    renderScreen()

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings[0]).toHaveTextContent(/gdy potrzebujesz rozmowy teraz/i)

    for (const line of CRISIS_LINES) {
      expect(screen.getByRole('link', { name: new RegExp(line.number.display) }))
        .toHaveAttribute('href', `tel:${line.number.dial}`)
    }
  })

  it('repeats the home screen\'s disclaimer word for word', () => {
    /** Two screens describing the app's limits in two slightly different ways is
     *  the drift the shared constant exists to prevent, and this is the screen
     *  where being precise about it matters most. */
    renderScreen()

    expect(screen.getByText(APP_DISCLAIMER)).toBeInTheDocument()
  })

  it('carries no tab bar of its own', () => {
    /** The bottom tab navigation was removed by a team decision; the header menu
     *  is the only navigation. */
    renderScreen()

    expect(document.querySelector('nav.bottom-nav')).not.toBeInTheDocument()
  })
})

describe('SafetyPlan — the treating specialist', () => {
  it('names the same therapist the profile card names, from one request', async () => {
    /** One source, so the two screens cannot disagree about who is treating this
     *  patient — see `CareDetails`. */
    await renderScreenWithCare()

    expect(await screen.findByText(/mgr Marta Zielińska/)).toBeInTheDocument()
  })

  it('keeps the crisis lines on screen while the therapist is still loading', async () => {
    /** The one indispensable half of this screen is local and unconditional. A
     *  never-resolving request must not be able to hold it back. */
    mockedProfile.mockReturnValue(new Promise(() => {}))

    renderScreen()

    for (const line of CRISIS_LINES) {
      expect(screen.getByRole('link', { name: new RegExp(line.number.display) }))
        .toHaveAttribute('href', `tel:${line.number.dial}`)
    }
  })

  it('omits the contact section rather than showing an empty one when there is no therapist', async () => {
    mockedProfile.mockResolvedValue({ ...ACCOUNT_PROFILE, care: null })

    await renderScreenWithCare()

    expect(screen.queryByText(/mgr Marta Zielińska/)).toBeNull()
    // And the numbers that do not depend on it are untouched.
    expect(screen.getByRole('link', { name: new RegExp(CRISIS_LINES[0].number.display) }))
      .toBeInTheDocument()
  })

  it('draws no dead tel: link for the therapist, because no column holds a number', async () => {
    await renderScreenWithCare()

    await screen.findByText(/mgr Marta Zielińska/)
    expect(screen.getByText(/bez numeru w planie/i)).toBeInTheDocument()
  })
})

describe('SafetyPlan — the patient writes it', () => {
  it('shows the plan the patient wrote, with a way to edit it', async () => {
    renderScreen()

    expect(await screen.findByText('Nie śpię dwie noce z rzędu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edytuj plan' })).toBeInTheDocument()
  })

  it('invites a patient with no plan to write one', async () => {
    mockedFetchPlan.mockResolvedValue(null)
    renderScreen()

    expect(await screen.findByText(/to zupełnie normalne/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Utwórz swój plan' })).toBeInTheDocument()
  })

  it('creates a plan from the form and shows it as saved', async () => {
    mockedFetchPlan.mockResolvedValue(null)
    mockedSavePlan.mockImplementation(async (input) => ({
      ...PLAN,
      warningSigns: input.warningSigns.filter(Boolean),
      copingStrategies: [],
      trustedPeople: [],
    }))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Utwórz swój plan' }))
    await userEvent.type(
      screen.getByLabelText('Sygnały ostrzegawcze — pozycja 1'), 'Przestaję odpisywać',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz plan' }))

    expect(mockedSavePlan).toHaveBeenCalledWith(
      expect.objectContaining({ warningSigns: ['Przestaję odpisywać'] }),
    )
    expect(await screen.findByText('Przestaję odpisywać')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zapisz plan' })).toBeNull()
  })

  it('opens the form filled with the stored plan', async () => {
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Edytuj plan' }))

    expect(screen.getByLabelText('Sygnały ostrzegawcze — pozycja 1')).toHaveValue('Nie śpię dwie noce z rzędu')
    expect(screen.getByLabelText('Imię')).toHaveValue('Ania')
    expect(screen.getByLabelText('Telefon', { selector: '#person-phone-0' })).toHaveValue('600 700 800')
  })

  it('cancelling leaves the plan as it was', async () => {
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Edytuj plan' }))
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(screen.getByText('Nie śpię dwie noce z rzędu')).toBeInTheDocument()
    expect(mockedSavePlan).not.toHaveBeenCalled()
  })

  it('keeps the form and says why when the server refuses the save', async () => {
    mockedSavePlan.mockRejectedValue(
      new ApiError(400, null, { trusted_people: 'Podaj numer telefonu — cyfry, spacje lub myślniki, np. 600 700 800.' }),
    )
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Edytuj plan' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz plan' }))

    expect(await screen.findByText(/Podaj numer telefonu/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz plan' })).toBeInTheDocument()
  })

  it('saves once however quickly the button is pressed', async () => {
    mockedSavePlan.mockReturnValue(new Promise(() => {}))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Edytuj plan' }))
    const save = screen.getByRole('button', { name: 'Zapisz plan' })
    save.click()
    save.click()
    save.click()

    await waitFor(() => expect(mockedSavePlan).toHaveBeenCalledTimes(1))
  })

  it('never asks the patient to list ways of hurting themselves', async () => {
    mockedFetchPlan.mockResolvedValue(null)
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Utwórz swój plan' }))

    expect(screen.queryByText(/zabezpiecz|usuń z otoczenia|ukryj przedmioty|sposob.* zrobienia sobie/i))
      .not.toBeInTheDocument()
  })
})

describe('SafetyPlan — when the plan does not load', () => {
  it('says so instead of showing an empty plan, and offers a retry', async () => {
    /** "Nie masz jeszcze planu" over a plan that exists but did not arrive would
     *  invite the person to write it again in a bad moment (CLAUDE.md §4). */
    mockedFetchPlan.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(PLAN)
    renderScreen()

    expect(await screen.findByText(/Nie udało się wczytać Twojego planu/)).toBeInTheDocument()
    expect(screen.queryByText(/to zupełnie normalne/i)).toBeNull()
    for (const line of CRISIS_LINES) {
      expect(screen.getByRole('link', { name: new RegExp(line.number.display) })).toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Nie śpię dwie noce z rzędu')).toBeInTheDocument()
  })
})
