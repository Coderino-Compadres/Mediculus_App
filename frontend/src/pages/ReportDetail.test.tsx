import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import ReportDetail from './ReportDetail'
import { ROUTES, journalDetailPath } from '../routes'
import { ApiError } from '../api/client'
import { weekReportId } from '../utils/reports'
import { EMOTION_COLORS } from '../utils/emotions'
import type { JournalListEntry } from '../types/diaryEntry'

const navigate = vi.fn()
/** The screen reads its week out of the route, so :id has to be a real param. */
let routeId = weekReportId('2026-08-10')

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: routeId }) }
})

vi.mock('../api/diary', () => ({ fetchJournalEntries: vi.fn() }))
const { fetchJournalEntries } = await import('../api/diary')
const mockedFetch = vi.mocked(fetchJournalEntries)

const WEEK_A = '2026-08-03' // Mon 3 – Sun 9 August 2026
const WEEK_B = '2026-08-10' // Mon 10 – Sun 16 August 2026

function entry(date: string, overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  return {
    id: `id-${date}`,
    date,
    savedAt: `${date}T21:00:00`,
    mood: 'neutral',
    emotions: [{ emotion: 'Lęk', intensity: 6 }],
    energyLevel: 4,
    tensionLevel: 6,
    situationReaction: {
      trigger: 'Praca',
      triggerOther: '',
      situation: '',
      emotionNote: '',
      thought: '',
      behavior: '',
    },
    notes: '',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
    ...overrides,
  }
}

/**
 * Both weeks in the fixtures have to be over, and `buildWeeklyReports` reads
 * "today" from the clock, so the clock is pinned just after them. It still has
 * to tick — `findBy*` and userEvent both wait on timers, and a frozen clock
 * makes every one of them time out.
 */
function pinClockAfterBothWeeks() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 20)) // Thursday 20 August 2026
}

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
  routeId = weekReportId(WEEK_B)
  pinClockAfterBothWeeks()
  return () => vi.useRealTimers()
})

describe('ReportDetail', () => {
  it('shows the week it covers and the two header actions, and nothing that shares it', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11')])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByRole('heading', { name: 'Raport' })).toBeInTheDocument()
    expect(screen.getAllByText('10 – 16 sierpnia 2026').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pełna analiza' })).toHaveAttribute('href', ROUTES.analysis)
    // Sharing is the specialist's side of the model, not a button here.
    expect(screen.queryByRole('button', { name: /wyślij|udostępnij/i })).toBeNull()
  })

  it('draws the four metric cards, each with its change against the previous week', async () => {
    mockedFetch.mockResolvedValue([
      entry('2026-08-04', { mood: 'bad' }),
      entry('2026-08-11', { mood: 'good' }),
    ])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Średni nastrój')).toBeInTheDocument()
    expect(screen.getByText('Średni poziom stresu')).toBeInTheDocument()
    expect(screen.getByText('Średni poziom energii')).toBeInTheDocument()
    expect(screen.getByText('Trudniejsze dni')).toBeInTheDocument()
    expect(screen.getByText('+2,0 od poprzedniego tygodnia')).toBeInTheDocument()
  })

  it('says plainly when there is no previous week, instead of implying a drop to zero', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11')])
    renderWithProviders(<ReportDetail />)

    expect(
      (await screen.findAllByText('brak poprzedniego tygodnia do porównania')).length,
    ).toBe(4)
  })

  it('colours the emotion bars from the shared palette', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11', { emotions: [{ emotion: 'Lęk', intensity: 6 }] })])
    const { container } = renderWithProviders(<ReportDetail />)

    await screen.findByText('Najczęściej odczuwane emocje')
    const fills = container.querySelectorAll<HTMLElement>('.report-ranking-fill')
    // Two rankings share the component; the first row is the top emotion.
    expect(fills[0].style.backgroundColor).toBe('rgb(155, 133, 196)')
    expect(EMOTION_COLORS['Lęk'].toUpperCase()).toBe('#9B85C4')
  })

  it('ranks the triggers the entries named', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11'), entry('2026-08-12')])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Najczęstsze wyzwalacze')).toBeInTheDocument()
    expect(screen.getByText('Praca')).toBeInTheDocument()
    // Both rankings read "2 dni" here: 'Lęk' on both days, 'Praca' on both days.
    expect(screen.getAllByText('2 dni')).toHaveLength(2)
  })

  it('keeps the risky-behaviour section visible on a week with none', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11')])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Zachowania ryzykowne')).toBeInTheDocument()
    expect(screen.getByText('Brak oznaczonych zachowań ryzykownych w tym tygodniu.')).toBeInTheDocument()
  })

  it('lists a flagged day with a preview and a link into the diary entry', async () => {
    mockedFetch.mockResolvedValue([
      entry('2026-08-11', { hasRiskyBehavior: true, riskyBehaviorNote: 'Wieczorem dwa piwa.' }),
    ])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText(/Zachowanie ryzykowne oznaczone w 1 z 7 dni/)).toBeInTheDocument()
    expect(screen.getByText('Wieczorem dwa piwa.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /wtorek, 11 sierpnia/i })
    expect(link).toHaveAttribute('href', journalDetailPath('id-2026-08-11'))
  })

  it('says a flagged day carries no description rather than showing an empty row', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11', { hasRiskyBehavior: true, riskyBehaviorNote: '' })])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Dzień oznaczony bez opisu.')).toBeInTheDocument()
  })

  it('sums the week up and chips the changes with a direction and a value', async () => {
    mockedFetch.mockResolvedValue([
      entry('2026-08-04', { mood: 'bad', tensionLevel: 4 }),
      entry('2026-08-11', { mood: 'good', tensionLevel: 7 }),
    ])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Podsumowanie tygodnia')).toBeInTheDocument()
    expect(screen.getByText('Nastrój +2,0')).toBeInTheDocument()
    expect(screen.getByText('Napięcie +3,0')).toBeInTheDocument()
  })

  it('reports the PDF as ready only once it is asked for, and names the file', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11')])
    renderWithProviders(<ReportDetail />)

    const button = await screen.findByRole('button', { name: 'Pobierz PDF' })
    expect(screen.queryByText(/Raport gotowy/)).toBeNull()

    await userEvent.click(button)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Raport gotowy: raport-tygodniowy-2026-08-10.pdf · 6 stron',
    )
    // No file is written yet, so the state must not send the patient looking for one.
    expect(screen.getByText(/pobieranie pliku uruchomimy w kolejnej wersji/i)).toBeInTheDocument()
  })

  it('wording for an id with no week behind it does not imply the report exists', async () => {
    routeId = weekReportId('2026-07-06')
    mockedFetch.mockResolvedValue([entry('2026-08-11')])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failed load says so instead of looking like a missing report', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać tego raportu/i)
    expect(screen.queryByText('Nie znaleziono takiego raportu.')).toBeNull()
  })

  it('goes back to the report list', async () => {
    mockedFetch.mockResolvedValue([entry('2026-08-11')])
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Wróć do Raportów' }))

    expect(navigate).toHaveBeenCalledWith(ROUTES.reports)
  })

  it('only counts the week it covers, not the week before it', async () => {
    routeId = weekReportId(WEEK_A)
    mockedFetch.mockResolvedValue([
      entry('2026-08-04', { mood: 'very_bad' }),
      entry('2026-08-11', { mood: 'very_good' }),
    ])
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('1,0 / 5')).toBeInTheDocument()
    expect(screen.getAllByText('3 – 9 sierpnia 2026').length).toBeGreaterThan(0)
  })
})
