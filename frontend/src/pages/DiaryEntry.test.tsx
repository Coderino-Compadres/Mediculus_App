import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DiaryEntry from './DiaryEntry'
import type { DiaryEntryDraft } from '../types/diaryEntry'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../api/diary', () => ({
  fetchTodayEntry: vi.fn(),
  saveTodayEntry: vi.fn(),
}))
const { fetchTodayEntry, saveTodayEntry } = await import('../api/diary')
const mockedFetch = vi.mocked(fetchTodayEntry)
const mockedSave = vi.mocked(saveTodayEntry)

function existingEntry(overrides: Partial<DiaryEntryDraft> = {}): DiaryEntryDraft {
  return {
    date: '2026-08-25',
    mood: 'bad',
    emotions: [{ emotion: 'Lęk', intensity: 7 }],
    energyLevel: 3,
    tensionLevel: 8,
    situationReaction: {
      trigger: 'Praca',
      triggerOther: '',
      situation: 'Rozmowa z przełożonym.',
      emotionNote: 'Ucisk w klatce.',
      thought: 'Nie dam rady.',
      behavior: 'Spacer.',
    },
    notes: 'Notatka.',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
    ...overrides,
  }
}

/** Opens "Więcej szczegółów", which is collapsed for a brand-new entry. */
async function openDetails() {
  const toggle = screen.getByRole('button', { name: /Więcej szczegółów/ })
  if (toggle.getAttribute('aria-expanded') === 'false') await userEvent.click(toggle)
}

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
  mockedSave.mockReset()
})

describe('loading today\'s entry', () => {
  it('says it is loading before the API answers', async () => {
    mockedFetch.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(<DiaryEntry />)

    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie')
  })

  it('opens as a new entry when nothing was written today', async () => {
    mockedFetch.mockResolvedValueOnce(null)

    renderWithProviders(<DiaryEntry />)

    expect(await screen.findByRole('heading', { name: 'Nowy wpis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz wpis' })).toBeInTheDocument()
  })

  it('opens as an edit, with the details already unfolded, when there is one', async () => {
    mockedFetch.mockResolvedValueOnce(existingEntry())

    renderWithProviders(<DiaryEntry />)

    expect(await screen.findByRole('heading', { name: 'Edycja wpisu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Więcej szczegółów/ })).toHaveAttribute(
      'aria-expanded', 'true',
    )
  })

  it('redraws every answer exactly as it was saved', async () => {
    mockedFetch.mockResolvedValueOnce(existingEntry())

    renderWithProviders(<DiaryEntry />)

    expect(await screen.findByRole('radio', { name: 'Źle' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Lęk' })).toHaveClass('emotion-chip-selected')
    expect(screen.getByLabelText('Natężenie: Lęk')).toHaveValue('7')
    expect(screen.getByLabelText('Poziom energii')).toHaveValue('3')
    expect(screen.getByLabelText('Poziom napięcia')).toHaveValue('8')
    expect(screen.getByRole('button', { name: 'Praca' })).toHaveClass('trigger-chip-selected')
    expect(screen.getByLabelText('Sytuacja')).toHaveValue('Rozmowa z przełożonym.')
    expect(screen.getByLabelText('Myśl')).toHaveValue('Nie dam rady.')
  })

  it('shows a failure instead of an empty form the patient might overwrite with', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))

    renderWithProviders(<DiaryEntry />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać')
    expect(screen.queryByRole('button', { name: /Zapisz/ })).not.toBeInTheDocument()
  })
})

describe('the two sliders that were removed', () => {
  it('has no separate stress slider — stress is rated on the emotion picker', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await openDetails()

    expect(screen.queryByLabelText('Poziom stresu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stres' })).toBeInTheDocument()
  })

  it('has no wellbeing slider — the five mood tiles already ask that', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await openDetails()

    expect(screen.queryByLabelText('Jakość samopoczucia')).not.toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(2)
  })
})

describe('saving', () => {
  it('sends what the patient filled in and goes back to the home screen', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await userEvent.click(screen.getByRole('radio', { name: 'Dobrze' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spokój' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave.mock.calls[0][0]).toMatchObject({
      mood: 'good',
      emotions: [{ emotion: 'Spokój', intensity: 0 }],
    })
    // The state is what makes /home say "Zapisano dzisiejszy wpis." — a message
    // rendered here would flash for one frame before the navigation.
    expect(navigate).toHaveBeenCalledWith(ROUTES.home, { state: { savedEntry: true } })
  })

  it('saves an entry that answers nothing — both questions are optional', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave.mock.calls[0][0].mood).toBeNull()
  })

  it('disables the button while the save is in flight, so it cannot be double-sent', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    let resolve: (v: DiaryEntryDraft) => void = () => {}
    mockedSave.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    const button = screen.getByRole('button', { name: 'Zapisywanie…' })
    expect(button).toBeDisabled()
    resolve(existingEntry())
  })

  it('keeps the patient on the form when the save fails, with their answers intact', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockRejectedValueOnce(new ApiError(500, null))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await userEvent.click(screen.getByRole('radio', { name: 'Dobrze' }))

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać')
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Dobrze' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Zapisz wpis' })).toBeEnabled()
  })

  it('shows the server\'s own message when it sent one', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockRejectedValueOnce(new ApiError(403, 'Dzienniczek jest dostępny tylko dla konta pacjenta.'))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('tylko dla konta pacjenta')
  })
})

describe('the risky-behaviour flag', () => {
  it('asks for a description once it is switched on', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    await userEvent.click(screen.getByRole('button', { name: /Oznacz zachowanie ryzykowne/ }))

    expect(screen.getByLabelText(/Opis/)).toBeInTheDocument()
  })

  it('refuses to save a flag with nothing under it, because NULL means "none"', async () => {
    // The database records only the description; a flag with no text would be
    // indistinguishable from an unflagged entry, i.e. silently lost.
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()
    await userEvent.click(screen.getByRole('button', { name: /Oznacz zachowanie ryzykowne/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Opisz krótko')
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('saves once a description is typed', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()
    await userEvent.click(screen.getByRole('button', { name: /Oznacz zachowanie ryzykowne/ }))
    await userEvent.type(screen.getByLabelText(/Opis/), 'Alkohol wieczorem.')

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave.mock.calls[0][0]).toMatchObject({
      hasRiskyBehavior: true,
      riskyBehaviorNote: 'Alkohol wieczorem.',
    })
  })

  it('clears the complaint as soon as the patient starts writing', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()
    await userEvent.click(screen.getByRole('button', { name: /Oznacz zachowanie ryzykowne/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))
    await screen.findByRole('alert')

    await userEvent.type(screen.getByLabelText(/Opis/), 'A')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides the description again when the flag is switched off', async () => {
    mockedFetch.mockResolvedValueOnce(existingEntry({ hasRiskyBehavior: true, riskyBehaviorNote: 'Coś.' }))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Edycja wpisu' })

    await userEvent.click(screen.getByRole('button', { name: /Oznacz zachowanie ryzykowne/ }))

    expect(screen.queryByLabelText(/Opis/)).not.toBeInTheDocument()
  })
})

describe('pora dnia', () => {
  /** The four chips, as a group — named so it cannot match the place chips. */
  function timeOfDayGroup() {
    return screen.getByRole('group', { name: 'Pora dnia' })
  }

  it('offers the four parts of the day, and none of them preselected', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    const chips = within(timeOfDayGroup()).getAllByRole('button')

    expect(chips.map((chip) => chip.textContent)).toEqual(['Rano', 'Południe', 'Wieczór', 'Noc'])
    for (const chip of chips) expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('is a separate question from the place, each row under its own heading', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    const place = screen.getByRole('group', { name: 'Miejsce' })

    expect(within(place).getAllByRole('button').map((chip) => chip.textContent)).toContain('Praca')
    expect(within(timeOfDayGroup()).queryByRole('button', { name: 'Praca' })).not.toBeInTheDocument()
    expect(within(place).queryByRole('button', { name: 'Rano' })).not.toBeInTheDocument()
  })

  it('sits with the place, not in the always-visible part of the form', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    expect(screen.queryByRole('group', { name: 'Pora dnia' })).not.toBeInTheDocument()
  })

  it('saves the chosen one', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry({ timeOfDay: 'evening' }))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    await userEvent.click(screen.getByRole('button', { name: 'Wieczór' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    expect(mockedSave.mock.calls[0][0]).toMatchObject({ timeOfDay: 'evening' })
  })

  it('replaces the previous choice — one pora dnia per entry, unlike emotions', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    await userEvent.click(screen.getByRole('button', { name: 'Rano' }))
    await userEvent.click(screen.getByRole('button', { name: 'Noc' }))

    expect(screen.getByRole('button', { name: 'Rano' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Noc' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))
    expect(mockedSave.mock.calls[0][0]).toMatchObject({ timeOfDay: 'night' })
  })

  it('unselects on a second press, like the place chips do', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    await userEvent.click(screen.getByRole('button', { name: 'Rano' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rano' }))

    expect(screen.getByRole('button', { name: 'Rano' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))
    expect(mockedSave.mock.calls[0][0].timeOfDay).toBeUndefined()
  })

  it('does not block a save when nothing was picked — no field on this form does', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave.mock.calls[0][0].timeOfDay).toBeUndefined()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('redraws the chip an existing entry was saved with', async () => {
    mockedFetch.mockResolvedValueOnce(existingEntry({ timeOfDay: 'noon' }))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Edycja wpisu' })

    expect(screen.getByRole('button', { name: 'Południe' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('the "Inne" trigger', () => {
  it('reveals a text box only when "Inne" is chosen', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()

    expect(screen.queryByPlaceholderText(/własną sytuację/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Inne' }))

    expect(screen.getByPlaceholderText(/własną sytuację/)).toBeInTheDocument()
  })

  it('carries the typed place into the draft that gets saved', async () => {
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await openDetails()
    await userEvent.click(screen.getByRole('button', { name: 'Inne' }))
    await userEvent.type(screen.getByPlaceholderText(/własną sytuację/), 'Dworzec')

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave.mock.calls[0][0].situationReaction).toMatchObject({
      trigger: 'Inne',
      triggerOther: 'Dworzec',
    })
  })
})

describe('leaving with unsaved changes', () => {
  async function loadEmptyForm() {
    mockedFetch.mockResolvedValueOnce(null)
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
  }

  const back = () => screen.getByRole('button', { name: 'Wróć do strony głównej' })

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    return () => vi.restoreAllMocks()
  })

  it('goes straight back when nothing has been filled in', async () => {
    await loadEmptyForm()

    await userEvent.click(back())

    expect(window.confirm).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith(ROUTES.home)
  })

  it('asks before throwing away what was typed', async () => {
    await loadEmptyForm()
    await userEvent.click(screen.getByRole('radio', { name: 'Dobrze' }))

    await userEvent.click(back())

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/niezapisane zmiany/i))
    expect(navigate).toHaveBeenCalledWith(ROUTES.home)
  })

  it('stays put when the answer is no', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    await loadEmptyForm()
    await userEvent.click(screen.getByRole('radio', { name: 'Dobrze' }))

    await userEvent.click(back())

    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Nowy wpis' })).toBeInTheDocument()
  })

  it('a change undone is not a change', async () => {
    // Compared by value, not tracked with a flag: picking something and taking
    // it back leaves nothing to lose. An emotion chip is the control that
    // toggles — a mood tile is a radio and cannot be unset.
    await loadEmptyForm()
    const chip = screen.getByRole('button', { name: 'Spokój' })
    await userEvent.click(chip)
    await userEvent.click(chip)

    await userEvent.click(back())

    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('does not ask after a successful save', async () => {
    // The guard must not query the very changes that were just written.
    mockedFetch.mockResolvedValueOnce(null)
    mockedSave.mockResolvedValueOnce(existingEntry())
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('heading', { name: 'Nowy wpis' })
    await userEvent.click(screen.getByRole('radio', { name: 'Dobrze' }))

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz wpis' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalled())
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('a failed load leaves nothing to protect', async () => {
    // An empty form the user never saw is not unsaved work.
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))
    renderWithProviders(<DiaryEntry />)
    await screen.findByRole('alert')

    await userEvent.click(back())

    expect(window.confirm).not.toHaveBeenCalled()
  })
})
