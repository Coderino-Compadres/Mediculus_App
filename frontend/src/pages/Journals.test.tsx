import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import Journals from './Journals'
import { ROUTES, journalDetailPath } from '../routes'
import { ApiError } from '../api/client'
import type { JournalListEntry } from '../types/diaryEntry'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../api/diary', () => ({ fetchJournalEntries: vi.fn() }))
const { fetchJournalEntries } = await import('../api/diary')
const mockedFetch = vi.mocked(fetchJournalEntries)

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function entry(overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  const date = overrides.date ?? isoDaysAgo(1)
  const base = {
    id: `id-${date}`,
    date,
    savedAt: `${date}T21:42:00`,
    mood: 'bad' as const,
    emotions: [{ emotion: 'Lęk' as const, intensity: 7 }],
    energyLevel: 3,
    tensionLevel: 7,
    situationReaction: {
      trigger: 'Praca',
      triggerOther: '',
      situation: 'Trudna rozmowa z przełożonym.',
      emotionNote: '',
      thought: '',
      behavior: '',
    },
    notes: '',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
  }
  return { ...base, ...overrides }
}

/** An entry whose preview line is `text`, so tests can find their own rows. */
function entryPreviewing(text: string, overrides: Partial<JournalListEntry> = {}) {
  const built = entry(overrides)
  return {
    ...built,
    situationReaction: { ...built.situationReaction, situation: text },
  }
}

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
})

describe('loading the archive', () => {
  it('says it is loading before the API answers', () => {
    mockedFetch.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(<Journals />)

    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie dzienniczków')
  })

  it('asks for the whole history once, not just today', async () => {
    mockedFetch.mockResolvedValueOnce([])

    renderWithProviders(<Journals />)

    await screen.findByText('Nie masz jeszcze żadnych wpisów.')
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('renders one row per entry the API returned', async () => {
    mockedFetch.mockResolvedValueOnce([
      entryPreviewing('Nowszy dzień', { date: isoDaysAgo(1) }),
      entryPreviewing('Starszy dzień', { date: isoDaysAgo(5) }),
    ])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Nowszy dzień')).toBeInTheDocument()
    expect(screen.getByText('Starszy dzień')).toBeInTheDocument()
  })

  it('tells an empty diary apart from an empty filter result', async () => {
    mockedFetch.mockResolvedValueOnce([])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Nie masz jeszcze żadnych wpisów.')).toBeInTheDocument()
  })

  it('shows a failure rather than an archive that looks empty', async () => {
    // An empty list and a failed request must not look the same: one means "you
    // have written nothing", the other means "we could not tell".
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))

    renderWithProviders(<Journals />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać dzienniczków')
    expect(screen.queryByText('Nie masz jeszcze żadnych wpisów.')).not.toBeInTheDocument()
  })

  it("shows the server's own message when it sent one", async () => {
    mockedFetch.mockRejectedValueOnce(
      new ApiError(403, 'Dzienniczek jest dostępny tylko dla konta pacjenta.'),
    )

    renderWithProviders(<Journals />)

    expect(await screen.findByRole('alert')).toHaveTextContent('tylko dla konta pacjenta')
  })
})

describe('today versus the archive', () => {
  it('marks a past entry read-only', async () => {
    mockedFetch.mockResolvedValueOnce([entryPreviewing('Wczoraj', { date: isoDaysAgo(2) })])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Tylko odczyt')).toBeInTheDocument()
  })

  it('does not mark today read-only — it is the one entry still editable', async () => {
    mockedFetch.mockResolvedValueOnce([entryPreviewing('Dziś', { date: isoDaysAgo(0) })])

    renderWithProviders(<Journals />)

    await screen.findByText('Dziś')
    expect(screen.queryByText('Tylko odczyt')).not.toBeInTheDocument()
  })

  it('opens today in the editable form', async () => {
    mockedFetch.mockResolvedValueOnce([entryPreviewing('Dziś', { date: isoDaysAgo(0) })])
    renderWithProviders(<Journals />)

    await userEvent.click((await screen.findByText('Dziś')).closest('button')!)

    expect(navigate).toHaveBeenCalledWith(ROUTES.diaryEntry)
  })

  it('opens a past entry in the read-only detail, addressed by its real id', async () => {
    mockedFetch.mockResolvedValueOnce([
      entryPreviewing('Wczoraj', { date: isoDaysAgo(3), id: 'abc-123' }),
    ])
    renderWithProviders(<Journals />)

    await userEvent.click((await screen.findByText('Wczoraj')).closest('button')!)

    expect(navigate).toHaveBeenCalledWith(journalDetailPath('abc-123'))
  })
})

describe('the row summary', () => {
  it('previews the situation, falling back to the notes', async () => {
    mockedFetch.mockResolvedValueOnce([entryPreviewing('', { notes: 'Tylko notatka.' })])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Tylko notatka.')).toBeInTheDocument()
  })

  it('says so when the entry has neither', async () => {
    mockedFetch.mockResolvedValueOnce([entryPreviewing('', { notes: '' })])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Brak notatki.')).toBeInTheDocument()
  })

  it('shows the two strongest emotions and the place, not all of them', async () => {
    mockedFetch.mockResolvedValueOnce([
      entryPreviewing('Dzień', {
        emotions: [
          { emotion: 'Lęk', intensity: 4 },
          { emotion: 'Złość', intensity: 9 },
          { emotion: 'Wstyd', intensity: 2 },
        ],
      }),
    ])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Złość 9')).toBeInTheDocument()
    expect(screen.getByText('Lęk 4')).toBeInTheDocument()
    expect(screen.queryByText('Wstyd 2')).not.toBeInTheDocument()
    expect(screen.getByText('Praca')).toBeInTheDocument()
  })

  it('shows the typed place when the trigger was "Inne"', async () => {
    const built = entryPreviewing('Dzień')
    mockedFetch.mockResolvedValueOnce([
      { ...built, situationReaction: { ...built.situationReaction, trigger: 'Inne', triggerOther: 'Dworzec' } },
    ])

    renderWithProviders(<Journals />)

    expect(await screen.findByText('Dworzec')).toBeInTheDocument()
  })

  it('draws the mood as a rank, and a dash when none was saved', async () => {
    mockedFetch.mockResolvedValueOnce([
      entryPreviewing('Zły', { date: isoDaysAgo(1), mood: 'very_bad' }),
      entryPreviewing('Bez nastroju', { date: isoDaysAgo(2), mood: null }),
    ])

    renderWithProviders(<Journals />)

    expect(await screen.findByLabelText('Bardzo źle')).toHaveTextContent('1')
    expect(screen.getByLabelText('Brak nastroju')).toHaveTextContent('–')
  })
})

describe('the filters', () => {
  async function renderThreeMoods() {
    mockedFetch.mockResolvedValueOnce([
      entryPreviewing('Ciezki dzien', { date: isoDaysAgo(1), mood: 'very_bad' }),
      entryPreviewing('Dobry dzien', { date: isoDaysAgo(2), mood: 'very_good' }),
      entryPreviewing('Zwykly dzien', { date: isoDaysAgo(3), mood: 'neutral' }),
    ])
    renderWithProviders(<Journals />)
    await screen.findByText('Ciezki dzien')
  }

  it('shows everything by default', async () => {
    await renderThreeMoods()

    expect(screen.getByText('Ciezki dzien')).toBeInTheDocument()
    expect(screen.getByText('Dobry dzien')).toBeInTheDocument()
    expect(screen.getByText('Zwykly dzien')).toBeInTheDocument()
  })

  it('narrows to the hard days', async () => {
    await renderThreeMoods()

    await userEvent.click(screen.getByRole('button', { name: 'Trudniejsze dni' }))

    expect(screen.getByText('Ciezki dzien')).toBeInTheDocument()
    expect(screen.queryByText('Dobry dzien')).not.toBeInTheDocument()
    expect(screen.queryByText('Zwykly dzien')).not.toBeInTheDocument()
  })

  it('narrows to the good days', async () => {
    await renderThreeMoods()

    await userEvent.click(screen.getByRole('button', { name: 'Dobre dni' }))

    expect(screen.getByText('Dobry dzien')).toBeInTheDocument()
    expect(screen.queryByText('Ciezki dzien')).not.toBeInTheDocument()
  })

  it('says the filter is empty, not that the diary is', async () => {
    mockedFetch.mockResolvedValueOnce([entryPreviewing('Zwykly', { mood: 'neutral' })])
    renderWithProviders(<Journals />)
    await screen.findByText('Zwykly')

    await userEvent.click(screen.getByRole('button', { name: 'Dobre dni' }))

    expect(screen.getByText('Brak wpisów odpowiadających temu filtrowi.')).toBeInTheDocument()
  })

  it('drops an entry with no mood from both narrowed filters', async () => {
    // Its rank is unknown, so it is neither a hard day nor a good one.
    mockedFetch.mockResolvedValueOnce([entryPreviewing('Bez nastroju', { mood: null })])
    renderWithProviders(<Journals />)
    await screen.findByText('Bez nastroju')

    await userEvent.click(screen.getByRole('button', { name: 'Trudniejsze dni' }))
    expect(screen.getByText('Brak wpisów odpowiadających temu filtrowi.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dobre dni' }))
    expect(screen.getByText('Brak wpisów odpowiadających temu filtrowi.')).toBeInTheDocument()
  })

  it('filters what it already has instead of asking the server again', async () => {
    await renderThreeMoods()

    await userEvent.click(screen.getByRole('button', { name: 'Dobre dni' }))

    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })
})
