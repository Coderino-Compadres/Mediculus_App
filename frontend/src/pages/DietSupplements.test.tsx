import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietSupplements from './DietSupplements'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import type { Supplement, SupplementInput } from '../types/diet'

const fetchSupplements = vi.fn<() => Promise<Supplement[]>>()
const createSupplement = vi.fn<(input: SupplementInput) => Promise<Supplement[]>>()
const updateSupplement =
  vi.fn<(id: string, input: SupplementInput) => Promise<Supplement[]>>()
const deleteSupplement = vi.fn<(id: string) => Promise<void>>()
const setSupplementTaken = vi.fn<(id: string, taken: boolean) => Promise<Supplement[]>>()

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return {
    ...actual,
    fetchSupplements: () => fetchSupplements(),
    createSupplement: (input: SupplementInput) => createSupplement(input),
    updateSupplement: (id: string, input: SupplementInput) => updateSupplement(id, input),
    deleteSupplement: (id: string) => deleteSupplement(id),
    setSupplementTaken: (id: string, taken: boolean) => setSupplementTaken(id, taken),
  }
})

/**
 * "Suplementy i leki" — §08's second half.
 *
 * MOST OF WHAT IS PINNED HERE IS ABSENCE, and that is the point of the file.
 * §08 says of the water counter that there are no congratulations, no streak
 * and no message about falling short; among these patients are people with
 * eating disorders, and this is a list they open every morning. So there is no
 * "2 z 3", no bar, no percentage and no wording that names a dose as missed —
 * and each of those is a line somebody would "complete" the screen across.
 *
 * The second group is honesty about reminders: this deployment sends none at
 * all, and the screen has to say so rather than draw a switch that implies one.
 */

function supplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: 's1',
    name: 'Witamina D3',
    dose: '2000 IU',
    frequency: 'raz dziennie',
    hour: '08:00',
    startDate: '2026-03-12',
    endDate: null,
    reminderEnabled: true,
    takenToday: false,
    ...overrides,
  }
}

/** Render, then wait the request out — every assertion is about the loaded screen. */
async function renderScreen() {
  renderWithProviders(<DietSupplements />)
  await waitFor(() => expect(screen.queryByText('Wczytywanie…')).toBeNull())
}

beforeEach(() => {
  for (const mock of [
    fetchSupplements, createSupplement, updateSupplement, deleteSupplement,
    setSupplementTaken,
  ]) {
    mock.mockReset()
  }
  fetchSupplements.mockResolvedValue([])
  deleteSupplement.mockResolvedValue(undefined)
})

describe('the screen itself', () => {
  it('names the module and the screen', async () => {
    await renderScreen()

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Suplementy i leki' }))
      .toBeInTheDocument()
  })

  it('leads back to the module, not to the psychotherapy home', async () => {
    await renderScreen()

    expect(screen.getByRole('link', { name: /Wróć do strony głównej/ }))
      .toHaveAttribute('href', ROUTES.diet)
  })

  it('says a failed load failed, rather than showing an empty list', async () => {
    /** "Nic tu jeszcze nie ma" about a list somebody filled in would be a false
     *  statement about their own medicines. */
    fetchSupplements.mockRejectedValue(new Error('offline'))

    await renderScreen()

    expect(screen.getByText(/Nie udało się wczytać listy/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nic tu jeszcze nie ma' })).toBeNull()
  })

  it('says the server\'s own reason when it gave one, not "nie udało się"', async () => {
    /** THE REFUSALS A PATIENT CAN ACTUALLY MEET HERE ARE GATES, NOT FAULTS: an
     *  account waiting on a guardian's acceptance (RODO art. 8), or one whose
     *  consents are not in force. The API answers those with a sentence saying
     *  so and what to do about it, and replacing it with "nie udało się wczytać
     *  listy" would tell somebody a request failed when they were in fact told
     *  to ask somebody else to answer a form. This screen used to throw that
     *  message away. */
    fetchSupplements.mockRejectedValue(
      new ApiError(403, 'To konto czeka na akceptację opiekuna.'),
    )

    await renderScreen()

    expect(screen.getByText('To konto czeka na akceptację opiekuna.')).toBeInTheDocument()
    expect(screen.queryByText(/Nie udało się wczytać listy/)).toBeNull()
  })

  it('offers a retry that asks again', async () => {
    fetchSupplements.mockRejectedValueOnce(new Error('offline'))
    fetchSupplements.mockResolvedValue([supplement()])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /Spróbuj ponownie/i }))

    expect(await screen.findByRole('heading', { name: 'Witamina D3' })).toBeInTheDocument()
  })
})

describe('an empty list', () => {
  it('is an ordinary state, not a failure', async () => {
    /** Most people take nothing. */
    await renderScreen()

    expect(screen.getByRole('heading', { name: 'Nic tu jeszcze nie ma' }))
      .toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says that only the name is needed', async () => {
    await renderScreen()

    expect(screen.getByText(/wystarczy nazwa/)).toBeInTheDocument()
  })
})

describe('a row', () => {
  it('carries the name, the dose line and the period line the artboard draws', async () => {
    fetchSupplements.mockResolvedValue([supplement()])

    await renderScreen()

    expect(screen.getByRole('heading', { name: 'Witamina D3' })).toBeInTheDocument()
    expect(screen.getByText('2000 IU · raz dziennie')).toBeInTheDocument()
    expect(screen.getByText('od 12 marca, bezterminowo')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
  })

  it('says "od … do …" when the regimen has an end', async () => {
    fetchSupplements.mockResolvedValue([
      supplement({ startDate: '2026-06-02', endDate: '2026-09-02' }),
    ])

    await renderScreen()

    expect(screen.getByText('od 2 czerwca do 2 września')).toBeInTheDocument()
  })

  it('renders by name alone when nothing else was answered', async () => {
    /** §05's rule: no field blocks a save, so the screen must not invent the
     *  missing halves or label them as missing. */
    fetchSupplements.mockResolvedValue([
      supplement({ dose: null, frequency: null, hour: null, startDate: null }),
    ])

    await renderScreen()

    expect(screen.getByRole('heading', { name: 'Witamina D3' })).toBeInTheDocument()
    expect(screen.queryByText(/brak|nieznan|uzupełnij/i)).toBeNull()
  })

  it('has a checkbox named by the preparation it ticks off', async () => {
    fetchSupplements.mockResolvedValue([supplement()])

    await renderScreen()

    expect(screen.getByRole('checkbox', { name: 'Witamina D3' })).not.toBeChecked()
  })
})

describe('odhaczanie', () => {
  it('records a tick and redraws from the answer', async () => {
    fetchSupplements.mockResolvedValue([supplement()])
    setSupplementTaken.mockResolvedValue([supplement({ takenToday: true })])

    await renderScreen()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Witamina D3' }))

    expect(setSupplementTaken).toHaveBeenCalledWith('s1', true)
    expect(screen.getByRole('checkbox', { name: 'Witamina D3' })).toBeChecked()
  })

  it('takes a tick back', async () => {
    fetchSupplements.mockResolvedValue([supplement({ takenToday: true })])
    setSupplementTaken.mockResolvedValue([supplement({ takenToday: false })])

    await renderScreen()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Witamina D3' }))

    expect(setSupplementTaken).toHaveBeenCalledWith('s1', false)
  })

  it('does not flip the box on its own when the write fails', async () => {
    /** What is on screen is what the server holds — a box that ticked itself
     *  and stayed ticked would be a record of a dose nobody wrote down. */
    fetchSupplements.mockResolvedValue([supplement()])
    setSupplementTaken.mockRejectedValue(new Error('offline'))

    await renderScreen()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Witamina D3' }))

    expect(screen.getByRole('checkbox', { name: 'Witamina D3' })).not.toBeChecked()
    expect(screen.getByRole('alert')).toHaveTextContent(/Nie udało się/)
  })
})

describe('adding one', () => {
  it('opens the form from the artboard\'s own button', async () => {
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))

    expect(screen.getByRole('heading', { name: 'Nowa pozycja' })).toBeInTheDocument()
  })

  it('cannot be submitted without a name and can be with nothing else', async () => {
    createSupplement.mockResolvedValue([supplement({ name: 'Magnez' })])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))

    expect(screen.getByRole('button', { name: 'Dodaj do listy' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Nazwa'), 'Magnez')
    expect(screen.getByRole('button', { name: 'Dodaj do listy' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    expect(createSupplement).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Magnez' }),
    )
  })

  it('sends the whole form when it is filled in', async () => {
    createSupplement.mockResolvedValue([supplement()])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Magnez')
    await userEvent.type(screen.getByLabelText('Dawka'), '200 mg')
    await userEvent.type(screen.getByLabelText('Częstotliwość'), 'raz dziennie')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    expect(createSupplement).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Magnez',
        dose: '200 mg',
        frequency: 'raz dziennie',
      }),
    )
  })

  it('says that an empty end date means "bezterminowo"', async () => {
    /** An empty field that is a complete answer has to say which it is. */
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))

    expect(screen.getByText(/Puste znaczy „bezterminowo”/)).toBeInTheDocument()
  })

  it('closes the form and shows the new list on success', async () => {
    createSupplement.mockResolvedValue([supplement({ name: 'Magnez' })])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Magnez')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    expect(await screen.findByRole('heading', { name: 'Magnez' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nowa pozycja' })).toBeNull()
  })

  it('shows a server refusal on the input that produced it', async () => {
    /** The one refusal this form can get is "end before start", raised under
     *  `end_date` — it has to reach that input rather than the top of the
     *  screen, which is the failure the registration form had with
     *  `invitation_code`. */
    createSupplement.mockRejectedValue(
      new ApiError(400, null, { end_date: 'Data zakończenia nie może być wcześniejsza.' }),
    )

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Magnez')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    const field = screen.getByLabelText('Do kiedy')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(/nie może być wcześniejsza/)
    // The form stays open, or the answer would be shown next to a field that is
    // no longer on screen.
    expect(screen.getByRole('heading', { name: 'Nowa pozycja' })).toBeInTheDocument()
  })
})

describe('editing one', () => {
  it('opens the form with the stored values', async () => {
    fetchSupplements.mockResolvedValue([supplement()])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /Edytuj/ }))

    expect(screen.getByRole('heading', { name: 'Edytuj pozycję' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nazwa')).toHaveValue('Witamina D3')
    expect(screen.getByLabelText('Dawka')).toHaveValue('2000 IU')
  })

  it('sends the whole form, because a cleared field is an answer taken back', async () => {
    fetchSupplements.mockResolvedValue([supplement()])
    updateSupplement.mockResolvedValue([supplement({ dose: null })])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /Edytuj/ }))
    await userEvent.clear(screen.getByLabelText('Dawka'))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(updateSupplement).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ name: 'Witamina D3', dose: '' }),
    )
  })
})

describe('deleting one', () => {
  it('asks twice and says the ticks go with it', async () => {
    /** A stray tap on a phone must not take a medicine list entry and its
     *  history with it — the same two-step ending care uses. */
    fetchSupplements.mockResolvedValue([supplement()])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /^Usuń/ }))

    expect(screen.getByText(/razem z odhaczeniami/)).toBeInTheDocument()
    expect(screen.getByText(/nie da się cofnąć/)).toBeInTheDocument()
    expect(deleteSupplement).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Tak, usuń' }))

    expect(deleteSupplement).toHaveBeenCalledWith('s1')
  })

  it('can be backed out of', async () => {
    fetchSupplements.mockResolvedValue([supplement()])

    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /^Usuń/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Zostaw' }))

    expect(screen.queryByText(/razem z odhaczeniami/)).toBeNull()
    expect(deleteSupplement).not.toHaveBeenCalled()
  })
})

describe('reminders', () => {
  it('says out loud that the app sends none yet', async () => {
    /** The artboard draws a switch and describes "ciche powiadomienie o
     *  wyznaczonej godzinie". This deployment has no push and no mail, so a
     *  switch alone would promise something nothing can send. */
    await renderScreen()

    expect(screen.getByRole('heading', { name: 'Przypomnienia' })).toBeInTheDocument()
    expect(
      screen.getAllByText(/nie wysyła jeszcze żadnych powiadomień/).length,
    ).toBeGreaterThan(0)
  })

  it('asks the question per position rather than once for the screen', async () => {
    /** Each preparation has its own hour, so a global switch could not say
     *  which one it applied to. */
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))

    expect(screen.getByRole('checkbox', { name: /ciche przypomnienie o tej godzinie/i }))
      .toBeChecked()
  })
})

describe('what this screen refuses to show', () => {
  const list = [
    supplement({ id: 'a', name: 'Witamina D3', takenToday: true }),
    supplement({ id: 'b', name: 'Magnez', takenToday: false, hour: '21:00' }),
    supplement({ id: 'c', name: 'Sertralina', takenToday: true }),
  ]

  it('counts nothing on screen — no "2 z 3", no percentage, no progress bar', async () => {
    fetchSupplements.mockResolvedValue(list)

    await renderScreen()

    for (const forbidden of [/2 z 3/, /\d+ *%/, /67/]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('never names a dose as missed, skipped or overdue', async () => {
    /** There is no stored "not taken" — an unticked box is a question nobody
     *  answered, and the screen must not read it as a failure. */
    fetchSupplements.mockResolvedValue(list)

    await renderScreen()

    for (const forbidden of [
      /pominię/i, /zaległ/i, /nie wziął/i, /nie wzięł/i, /spóźni/i, /brakuje/i,
    ]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('congratulates nobody and counts no streak', async () => {
    fetchSupplements.mockResolvedValue(list.map((s) => ({ ...s, takenToday: true })))

    await renderScreen()

    for (const forbidden of [/gratul/i, /brawo/i, /świetnie/i, /seria/i, /z rzędu/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('promises no link with a health profile', async () => {
    /** §08's own note records the open question — whether "przyjmowane leki" in
     *  the health profile is this data or a second entry — and §13 is not
     *  built, so naming it here would answer it in markup. */
    fetchSupplements.mockResolvedValue(list)

    await renderScreen()

    expect(screen.queryByText(/profil zdrowotny/i)).toBeNull()
  })

  it('says how many positions are ticked only in the list\'s description', async () => {
    /** A screen reader is told what the ticks already say visually; nothing is
     *  drawn as a figure. */
    fetchSupplements.mockResolvedValue(list)

    await renderScreen()

    const rows = screen.getByRole('list', { name: /odhaczone dziś: 2/ })
    expect(within(rows).getAllByRole('listitem')).toHaveLength(3)
  })
})
