import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { PAGE_SIZE } from '../hooks/usePagination'
import { MAX_HOURS_PER_SUPPLEMENT } from '../utils/supplements'
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
    hours: ['08:00'],
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
      supplement({ dose: null, frequency: null, hours: [], startDate: null }),
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
    supplement({ id: 'b', name: 'Magnez', takenToday: false, hours: ['21:00'] }),
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

describe('the list is paginated', () => {
  /**
   * The one list in the app where paging costs something: this is a checklist
   * opened every morning, so a preparation on page two is a page turn away from
   * being ticked. `MAX_SUPPLEMENTS` (60) is a backstop rather than a product
   * rule, so an ordinary regimen never meets a second page at all — which is
   * why the first test here is that it does not.
   */
  const many = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => {
      const n = from + index
      // Hour-ordered, like the server's own ordering.
      const hour = `${String(6 + n).padStart(2, '0')}:00`
      return supplement({ id: `s-${n}`, name: `Preparat ${n}`, hours: [hour] })
    })

  it('draws no control over an ordinary regimen', async () => {
    fetchSupplements.mockResolvedValue(many(PAGE_SIZE))
    await renderScreen()

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('shows seven positions on a page', async () => {
    fetchSupplements.mockResolvedValue(many(20))
    await renderScreen()

    expect(screen.getByText(/Strona 1 z 3/)).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(PAGE_SIZE)
  })

  it('counts positions in the range it prints', async () => {
    fetchSupplements.mockResolvedValue(many(20))
    await renderScreen()

    expect(screen.getByText(/1–7 z 20 pozycji/)).toBeInTheDocument()
  })

  it('moves through the pages', async () => {
    fetchSupplements.mockResolvedValue(many(20))
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: /następna/i }))

    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()
    expect(screen.getByText('Preparat 7')).toBeInTheDocument()
    expect(screen.queryByText('Preparat 0')).toBeNull()
  })

  it('keeps the whole-list count out of the page, so no page becomes a score', async () => {
    // `takenCount` describes "Twoja lista", not the seven rows in front of you.
    // A count that moved with the page would be the "2 z 3" this screen exists
    // not to show.
    fetchSupplements.mockResolvedValue([
      ...many(10).slice(0, 9),
      supplement({ id: 's-taken', name: 'Odhaczony', hours: ['23:00'], takenToday: true }),
    ])
    await renderScreen()

    const list = screen.getByRole('list', { name: /^Lista: 10 pozycji, odhaczone dziś: 1/ })

    await userEvent.click(screen.getByRole('button', { name: /następna/i }))

    expect(list).toHaveAccessibleName(/Lista: 10 pozycji, odhaczone dziś: 1/)
  })

  it('says which slice of the list is on screen, once there is more than one', async () => {
    fetchSupplements.mockResolvedValue(many(20))
    await renderScreen()

    expect(
      screen.getByRole('list', { name: /na tej stronie: 1–7$/ }),
    ).toBeInTheDocument()
  })

  it('turns to the page a newly written position landed on', async () => {
    // The list is ordered by hour, so a preparation taken at 23:00 goes to the
    // end — a page the patient was not on. A form that saves and then hides
    // what it saved reads as a save that did nothing.
    fetchSupplements.mockResolvedValue(many(20))
    createSupplement.mockResolvedValue([
      ...many(20),
      supplement({ id: 's-late', name: 'Melatonina', hours: ['23:00'] }),
    ])
    await renderScreen()
    expect(screen.getByText(/Strona 1 z 3/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Melatonina')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    await waitFor(() => expect(screen.getByText('Melatonina')).toBeInTheDocument())
    expect(screen.getByText(/Strona 3 z 3/)).toBeInTheDocument()
  })

  it('falls back a page rather than emptying when the last row on it goes', async () => {
    fetchSupplements.mockResolvedValue(many(15))
    deleteSupplement.mockResolvedValue(undefined)
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /następna/i }))
    await userEvent.click(screen.getByRole('button', { name: /następna/i }))
    expect(screen.getByText(/Strona 3 z 3/)).toBeInTheDocument()

    fetchSupplements.mockResolvedValue(many(14))
    // The hidden half of the name runs into the visible half, so a regex.
    await userEvent.click(screen.getByRole('button', { name: /^Usuń.*Preparat 14$/ }))
    await userEvent.click(screen.getByRole('button', { name: /Tak, usuń/ }))

    await waitFor(() => expect(screen.getByText(/Strona 2 z 2/)).toBeInTheDocument())
  })
})

describe('several hours for one preparation', () => {
  /**
   * THE CASE THIS EXISTS FOR: somebody takes a probiotic at 06:45 and again
   * at 12:00. That is *one* position on the list with two hours on its row —
   * before `supplement_hour` the only way to write it was two preparations
   * sharing a name, which reads as two different probiotics.
   */

  it('shows every hour on the one row the preparation occupies', async () => {
    fetchSupplements.mockResolvedValue([
      supplement({ name: 'Probiotyk', hours: ['06:45', '12:00'] }),
    ])

    await renderScreen()

    expect(screen.getByText('06:45')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('renders a preparation with no hour without an empty badge', async () => {
    fetchSupplements.mockResolvedValue([
      supplement({ name: 'Witamina C', hours: [] }),
    ])

    await renderScreen()

    expect(screen.getByText('Witamina C')).toBeInTheDocument()
    expect(document.querySelector('.supplement-hour')).toBeNull()
  })

  it('counts nothing next to the hours', async () => {
    /** "2 ×" beside a medicine would be the module scoring a regimen, which
     *  is the one thing §08 says this screen must not do. */
    fetchSupplements.mockResolvedValue([
      supplement({ name: 'Probiotyk', hours: ['06:45', '12:00'] }),
    ])

    await renderScreen()

    for (const forbidden of [/2 ×/, /2x/i, /dwa razy dziennie/i, /razy dziennie/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('offers another hour box and sends both', async () => {
    createSupplement.mockResolvedValue([])
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Probiotyk')

    await userEvent.type(screen.getByLabelText('Godzina 1'), '06:45')
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj godzinę' }))
    await userEvent.type(screen.getByLabelText('Godzina 2'), '12:00')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    expect(createSupplement).toHaveBeenCalledWith(
      expect.objectContaining({ hours: ['06:45', '12:00'] }),
    )
  })

  it('can take an hour off again', async () => {
    createSupplement.mockResolvedValue([])
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Probiotyk')
    await userEvent.type(screen.getByLabelText('Godzina 1'), '06:45')
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj godzinę' }))
    await userEvent.type(screen.getByLabelText('Godzina 2'), '12:00')

    await userEvent.click(screen.getByRole('button', { name: 'Usuń godzinę 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    expect(createSupplement).toHaveBeenCalledWith(
      expect.objectContaining({ hours: ['06:45'] }),
    )
  })

  it('keeps a box on screen after the last hour is removed', async () => {
    /** No fixed hour is an ordinary answer, so the way to say it must not
     *  vanish with the field. */
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Godzina 1'), '06:45')

    await userEvent.click(screen.getByRole('button', { name: 'Usuń godzinę 1' }))

    expect(screen.getByLabelText('Godzina 1')).toHaveValue('')
  })

  it('sends no hours at all when none was typed', async () => {
    createSupplement.mockResolvedValue([])
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Witamina C')

    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do listy' }))

    expect(createSupplement).toHaveBeenCalledWith(
      expect.objectContaining({ hours: [''] }),
    )
  })

  it('opens an edit with every hour the preparation has', async () => {
    fetchSupplements.mockResolvedValue([
      supplement({ name: 'Probiotyk', hours: ['06:45', '12:00'] }),
    ])
    await renderScreen()

    await userEvent.click(screen.getByRole('button', { name: /^Edytuj/ }))

    expect(screen.getByLabelText('Godzina 1')).toHaveValue('06:45')
    expect(screen.getByLabelText('Godzina 2')).toHaveValue('12:00')
  })

  it('stops offering more boxes at the backstop', async () => {
    await renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '+ Dodaj suplement lub lek' }))

    const add = screen.getByRole('button', { name: '+ Dodaj godzinę' })
    for (let i = 1; i < MAX_HOURS_PER_SUPPLEMENT; i += 1) {
      await userEvent.click(add)
    }

    expect(add).toBeDisabled()
    expect(screen.getAllByLabelText(/^Godzina \d+$/)).toHaveLength(
      MAX_HOURS_PER_SUPPLEMENT,
    )
  })

  it('still ticks the whole day with one checkbox', async () => {
    /** Deliberate: a tick is a fact about a day, so a preparation taken twice
     *  has one checkbox. Whether each dose should be tickable separately is a
     *  question for the client — and answering it means the intake table
     *  learning about hours, plus a decision about what an untaken dose
     *  would mean. */
    fetchSupplements.mockResolvedValue([
      supplement({ name: 'Probiotyk', hours: ['06:45', '12:00'] }),
    ])

    await renderScreen()

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })
})
