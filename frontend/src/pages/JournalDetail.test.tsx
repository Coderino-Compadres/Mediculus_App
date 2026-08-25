import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import JournalDetail from './JournalDetail'
import { ApiError } from '../api/client'
import type { JournalListEntry } from '../types/diaryEntry'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: 'wpis-1' }) }
})

vi.mock('../api/diary', () => ({ fetchJournalEntry: vi.fn() }))
const { fetchJournalEntry } = await import('../api/diary')
const mockedFetch = vi.mocked(fetchJournalEntry)

function entry(overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  const base = {
    id: 'wpis-1',
    date: '2026-08-22',
    savedAt: '2026-08-22T21:42:00',
    mood: 'bad' as const,
    emotions: [
      { emotion: 'Lęk' as const, intensity: 7 },
      { emotion: 'Stres' as const, intensity: 8 },
    ],
    energyLevel: 3,
    tensionLevel: 7,
    situationReaction: {
      trigger: 'Praca',
      triggerOther: '',
      situation: 'Trudna rozmowa z przełożonym.',
      emotionNote: 'Ucisk w gardle.',
      thought: 'Znowu nie nadążę.',
      behavior: 'Wyszedłem na korytarz.',
    },
    notes: 'Wieczorem trochę lepiej.',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
})

describe('loading one entry', () => {
  it('says it is loading before the API answers', () => {
    mockedFetch.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(<JournalDetail />)

    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie wpisu')
  })

  it('asks for the entry named in the URL', async () => {
    mockedFetch.mockResolvedValueOnce(entry())

    renderWithProviders(<JournalDetail />)

    await screen.findByText('Trudna rozmowa z przełożonym.')
    expect(mockedFetch).toHaveBeenCalledWith('wpis-1')
  })

  it('renders every part of the entry', async () => {
    mockedFetch.mockResolvedValueOnce(entry())

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('Trudna rozmowa z przełożonym.')).toBeInTheDocument()
    expect(screen.getByText('Ucisk w gardle.')).toBeInTheDocument()
    expect(screen.getByText('Znowu nie nadążę.')).toBeInTheDocument()
    expect(screen.getByText('Wyszedłem na korytarz.')).toBeInTheDocument()
    expect(screen.getByText('Wieczorem trochę lepiej.')).toBeInTheDocument()
    expect(screen.getByText('Miejsce: Praca')).toBeInTheDocument()
    expect(screen.getByText('Źle')).toBeInTheDocument()
  })

  it('marks the entry read-only', async () => {
    mockedFetch.mockResolvedValueOnce(entry())

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('Tylko odczyt')).toBeInTheDocument()
  })

  it('offers nothing to edit with — no inputs at all', async () => {
    // Immutability is structural here: there is no form, and the API has no
    // write verb on this URL.
    mockedFetch.mockResolvedValueOnce(entry())

    renderWithProviders(<JournalDetail />)

    await screen.findByText('Trudna rozmowa z przełożonym.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})

describe('what the entry did not answer', () => {
  it('says so when no mood was saved', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ mood: null }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('Nastrój nie został zapisany.')).toBeInTheDocument()
  })

  it('says so when no emotion was picked', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ emotions: [] }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('Brak wybranych emocji.')).toBeInTheDocument()
  })

  it('shows an unrated emotion as such rather than as zero', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ emotions: [{ emotion: 'Spokój', intensity: null }] }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('bez oceny')).toBeInTheDocument()
  })

  it('shows a missing level as a dash, not as 0/10', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ energyLevel: null, tensionLevel: null }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findAllByText('—/10')).toHaveLength(2)
  })

  it('says so when there are no notes', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ notes: '' }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('Brak notatek.')).toBeInTheDocument()
  })
})

describe('the risky-behaviour section', () => {
  it('is absent when the entry was not flagged', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ hasRiskyBehavior: false }))

    renderWithProviders(<JournalDetail />)

    await screen.findByText('Trudna rozmowa z przełożonym.')
    expect(screen.queryByText(/Oznaczone zachowanie ryzykowne/)).not.toBeInTheDocument()
  })

  it('shows the description when it was', async () => {
    mockedFetch.mockResolvedValueOnce(
      entry({ hasRiskyBehavior: true, riskyBehaviorNote: 'Myśli o samookaleczeniu.' }),
    )

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText(/Oznaczone zachowanie ryzykowne/)).toBeInTheDocument()
    expect(screen.getByText('Myśli o samookaleczeniu.')).toBeInTheDocument()
  })
})

describe('the stress alert', () => {
  it('highlights stress at or above the threshold', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ emotions: [{ emotion: 'Stres', intensity: 8 }] }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('8/10')).toHaveClass('journal-emotion-value-alert')
  })

  it('leaves another emotion at the same rating alone', async () => {
    mockedFetch.mockResolvedValueOnce(entry({ emotions: [{ emotion: 'Radość', intensity: 8 }] }))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('8/10')).not.toHaveClass('journal-emotion-value-alert')
  })
})

describe('when the entry cannot be shown', () => {
  it('says it was not found for a 404 — which also covers somebody else\'s entry', async () => {
    // The backend answers 404 for a wrong id and for another patient's entry
    // alike, so this screen must not imply the entry exists.
    mockedFetch.mockRejectedValueOnce(new ApiError(404, 'Nie znaleziono tego wpisu.'))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByText('Nie znaleziono tego wpisu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wróć do Dzienniczków/ })).toBeInTheDocument()
  })

  it('distinguishes a failure from a missing entry', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))

    renderWithProviders(<JournalDetail />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać tego wpisu')
    expect(screen.queryByText('Nie znaleziono tego wpisu.')).not.toBeInTheDocument()
  })

  it('offers a way back to the archive from a failure', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))

    renderWithProviders(<JournalDetail />)

    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: /Wróć do Dzienniczków/ })).toBeInTheDocument()
  })
})
