import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistTechniqueForm from './SpecialistTechniqueForm'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import type { StoredTechnique } from '../api/techniques'

vi.mock('../api/techniques', () => ({
  fetchMyTechniques: vi.fn(),
  createTechnique: vi.fn(),
  updateTechnique: vi.fn(),
}))
const { createTechnique, fetchMyTechniques, updateTechnique } = await import('../api/techniques')
const mockedFetch = vi.mocked(fetchMyTechniques)
const mockedCreate = vi.mocked(createTechnique)
const mockedUpdate = vi.mocked(updateTechnique)

/**
 * The form a specialist writes a technique with. What is worth pinning is not
 * the inputs but the four decisions around them:
 *
 * - **saving is publishing.** The draft checkbox and the per-technique safety
 *   flag were removed on request, so the form must send neither and must say
 *   what saving does above the fields rather than hiding it behind one;
 * - **the identifier is derived from the name**, because it used to be an input
 *   asking a psychotherapist for "małe litery bez polskich znaków";
 * - **on an edit the stored slug goes back verbatim.** It is immutable and the
 *   backend *refuses* a change, so re-deriving it from an edited name would fail
 *   the save under a field this form does not render — nothing on screen;
 * - **an empty step is named by number here**, because the backend's answer is
 *   positional and the position is gone by the time it reaches the browser.
 */

const SPECIALIST = { ...TEST_USER, isPatient: false, isSpecialist: true, role: 'specjalista' }

function technique(overrides: Partial<StoredTechnique> = {}): StoredTechnique {
  return {
    id: 'id-oddech-478',
    idTechnique: 12,
    nazwa: 'Oddech 4-7-8',
    podtytul: 'Spowolnienie oddechu w chwili napięcia.',
    szkola: ['relaksacyjne'],
    grupa: 'kryzys',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    wprowadzenie: 'Kiedy trudno się uspokoić.',
    kroki: [{ nazwa: 'Wdech', opis: 'Wdech przez nos na cztery.', przyklady: ['w łóżku'] }],
    opisGotowy: true,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

/** The form on its own route, so `navigate` after a save is observable. */
function renderForm(route: string = ROUTES.specialistTechniqueNew) {
  return renderWithProviders(
    <Routes>
      <Route path={ROUTES.specialistTechniqueNew} element={<SpecialistTechniqueForm />} />
      <Route path={ROUTES.specialistTechniqueEdit} element={<SpecialistTechniqueForm />} />
      <Route path={ROUTES.specialistTechniques} element={<p>Moje techniki</p>} />
    </Routes>,
    { user: SPECIALIST, route },
  )
}

async function fillMinimum() {
  await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'Uważny oddech')
  await userEvent.type(screen.getByLabelText('Wprowadzenie'), 'Kiedy trudno się uspokoić.')
  await userEvent.type(screen.getByLabelText('Opis kroku'), 'Wdech przez nos na cztery.')
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedCreate.mockReset()
  mockedUpdate.mockReset()
})

describe('a new technique', () => {
  it('says out loud that saving publishes it to every patient', async () => {
    /** Stated rather than asked: there is no draft state, so the consequence
     *  belongs above the form instead of behind a checkbox somebody can miss. */
    renderForm()

    expect(screen.getByText(/od razu widoczna dla wszystkich pacjentów/)).toBeInTheDocument()
  })

  it('offers neither a draft checkbox nor a safety flag', async () => {
    /** Both were on this form and both were removed on request. The columns
     *  behind them still exist, so this is the place they would come back — but
     *  until the client asks, a body that could hold a technique back must not
     *  be constructible from the screen. */
    renderForm()

    expect(screen.queryByLabelText(/Gotowa do publikacji/i)).toBeNull()
    expect(screen.queryByLabelText(/specjalist/i)).toBeNull()
    expect(screen.queryByLabelText(/Dostępność/i)).toBeNull()
  })

  it('does not ask for the identifier', async () => {
    /** It is derived from the name — see `techniqueSlug`. It used to be its own
     *  input, with a hint about lowercase letters and hyphens. */
    renderForm()

    expect(screen.queryByLabelText(/[Ii]dentyfikator/)).toBeNull()
    expect(screen.queryByLabelText(/slug/i)).toBeNull()
  })

  it('starts with one step, so the shape of the answer is visible', async () => {
    renderForm()

    expect(screen.getByText('Krok 1')).toBeInTheDocument()
    expect(screen.queryByText('Krok 2')).toBeNull()
  })

  it('sends a slug derived from the name, with no diacritics in it', async () => {
    mockedCreate.mockResolvedValueOnce(technique())
    renderForm()

    await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'Uważny oddech')
    await userEvent.type(screen.getByLabelText('Wprowadzenie'), 'Kiedy trudno.')
    await userEvent.type(screen.getByLabelText('Opis kroku'), 'Wdech.')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const sent = mockedCreate.mock.calls[0][0]

    expect(sent.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(sent.slug).toContain('uwazny-oddech')
    expect(sent.name).toBe('Uważny oddech')
  })

  it('sends the tabs that were ticked, and can send more than one', async () => {
    /** A technique exists once and appears in every tab it is tagged with —
     *  the deliberate departure from the mockup's disjoint folders. */
    mockedCreate.mockResolvedValueOnce(technique())
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('checkbox', { name: 'DBT' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Relaksacyjne' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    expect(mockedCreate.mock.calls[0][0].schools).toEqual(['dbt', 'relaksacyjne'])
  })

  it('un-ticking a tab removes it again', async () => {
    mockedCreate.mockResolvedValueOnce(technique())
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('checkbox', { name: 'DBT' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'DBT' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    expect(mockedCreate.mock.calls[0][0].schools).toEqual([])
  })

  it('leaves the optional selects unanswered rather than guessing', async () => {
    mockedCreate.mockResolvedValueOnce(technique())
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const sent = mockedCreate.mock.calls[0][0]

    expect(sent.dbtGroup).toBe('')
    expect(sent.dbtModule).toBe('')
    expect(sent.durationMin).toBe('')
  })

  it('goes back to the list once the technique is saved', async () => {
    mockedCreate.mockResolvedValueOnce(technique())
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(await screen.findByText('Moje techniki')).toBeInTheDocument()
  })

  it('adds and removes steps, renumbering them', async () => {
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Dodaj krok' }))
    expect(screen.getByText('Krok 2')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Usuń krok' })[1])
    expect(screen.queryByText('Krok 2')).toBeNull()
  })

  it('never offers to remove the only step', async () => {
    /** A technique with no steps opens a screen with a heading over nothing. */
    renderForm()

    expect(screen.queryByRole('button', { name: 'Usuń krok' })).toBeNull()
  })
})

describe('a step with no description', () => {
  it('is named by its number, and nothing is sent', async () => {
    /** The backend refuses it too, but positionally — and the position is gone
     *  by the time the error reaches the browser, which would leave a specialist
     *  with six steps hunting for the blank one. */
    renderForm()

    await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'Uważny oddech')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj krok' }))
    await userEvent.type(screen.getAllByLabelText('Opis kroku')[0], 'Wdech.')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(screen.getByText(/Krok 2 nie ma opisu/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('counts whitespace as no description', async () => {
    renderForm()

    await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'Uważny oddech')
    await userEvent.type(screen.getByLabelText('Opis kroku'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(screen.getByText(/Krok 1 nie ma opisu/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })
})

describe('when the server refuses the technique', () => {
  it('puts a taken name under the name, not under a field nobody can see', async () => {
    /** The slug has no input any more, so its refusal has to land on what
     *  produced it — the name. */
    mockedCreate.mockRejectedValueOnce(new ApiError(400, null, { slug: 'Technika o tym identyfikatorze już istnieje.' }))
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(await screen.findByText(/nazwy nie mogą się powtarzać/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nazwa techniki')).toHaveAttribute('aria-invalid', 'true')
  })

  it('places a field verdict on its own input', async () => {
    mockedCreate.mockRejectedValueOnce(
      new ApiError(400, null, { intro: 'Podaj wprowadzenie.', schools: 'Wybierz zakładkę.' }),
    )
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(await screen.findByText('Podaj wprowadzenie.')).toBeInTheDocument()
    expect(screen.getByText('Wybierz zakładkę.')).toBeInTheDocument()
  })

  it('keeps what was typed, so a refusal is not a retyped form', async () => {
    mockedCreate.mockRejectedValueOnce(new ApiError(400, 'Nie zapisano.'))
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(await screen.findByText('Nie zapisano.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nazwa techniki')).toHaveValue('Uważny oddech')
    expect(screen.queryByText('Moje techniki')).toBeNull()
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('network'))
    renderForm()

    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(await screen.findByText('Nie udało się zapisać techniki. Spróbuj ponownie.'))
      .toBeInTheDocument()
  })
})

describe('editing a technique', () => {
  const editRoute = '/specialist/techniques/12/edit'

  it('loads the stored technique into the form', async () => {
    mockedFetch.mockResolvedValueOnce([technique()])
    renderForm(editRoute)

    expect(await screen.findByLabelText('Nazwa techniki')).toHaveValue('Oddech 4-7-8')
    expect(screen.getByLabelText('Wprowadzenie')).toHaveValue('Kiedy trudno się uspokoić.')
    expect(screen.getByLabelText('Opis kroku')).toHaveValue('Wdech przez nos na cztery.')
    expect(screen.getByLabelText('Przykłady')).toHaveValue('w łóżku')
  })

  it('sends the stored identifier back verbatim, even after the name is edited', async () => {
    /** THE LOAD-BEARING ONE. The slug is immutable and `update()` refuses a
     *  change rather than ignoring it, so re-deriving it from the new name would
     *  make renaming a technique fail under a field this form does not
     *  render — a save that fails with nothing on screen. */
    mockedFetch.mockResolvedValueOnce([technique()])
    mockedUpdate.mockResolvedValueOnce(technique())
    renderForm(editRoute)

    const name = await screen.findByLabelText('Nazwa techniki')
    await userEvent.clear(name)
    await userEvent.type(name, 'Oddech 4-7-8 (poprawiony)')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    const [id, sent] = mockedUpdate.mock.calls[0]

    expect(id).toBe(12)
    expect(sent.slug).toBe('id-oddech-478')
    expect(sent.name).toBe('Oddech 4-7-8 (poprawiony)')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('says the change is visible to every patient at once', async () => {
    mockedFetch.mockResolvedValueOnce([technique()])
    renderForm(editRoute)

    expect(await screen.findByText(/widzą od razu wszyscy pacjenci/)).toBeInTheDocument()
  })

  it('renders a step with no examples without inventing any', async () => {
    mockedFetch.mockResolvedValueOnce([
      technique({ kroki: [{ opis: 'Sam opis.' }] }),
    ])
    renderForm(editRoute)

    expect(await screen.findByLabelText('Przykłady')).toHaveValue('')
    expect(screen.getByLabelText('Nazwa kroku')).toHaveValue('')
  })

  it("says a colleague's technique is not among yours, rather than showing an empty form", async () => {
    /** The API answers 404 for somebody else's technique. An empty form here
     *  would invite the specialist to fill it in and create a second one. */
    mockedFetch.mockResolvedValueOnce([])
    renderForm(editRoute)

    expect(await screen.findByText('Nie znaleziono tej techniki wśród Twoich technik.'))
      .toBeInTheDocument()
    expect(screen.queryByLabelText('Nazwa techniki')).toBeNull()
  })

  it('offers a way back to the list when it cannot load', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    renderForm(editRoute)

    expect(await screen.findByText('Nie udało się wczytać techniki. Spróbuj ponownie.'))
      .toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wróć do moich technik/ })).toBeInTheDocument()
  })

  it('can ask again after a failure', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    mockedFetch.mockResolvedValueOnce([technique()])
    renderForm(editRoute)

    await userEvent.click(await screen.findByRole('button', { name: /ponownie|Spróbuj/ }))

    expect(await screen.findByLabelText('Nazwa techniki')).toHaveValue('Oddech 4-7-8')
  })
})
