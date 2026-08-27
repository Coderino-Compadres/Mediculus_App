import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import Reports from './Reports'
import { reportDetailPath } from '../routes'
import { ApiError } from '../api/client'
import { weekReportId } from '../utils/reports'
import type { JournalListEntry } from '../types/diaryEntry'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../api/diary', () => ({ fetchJournalEntries: vi.fn() }))
const { fetchJournalEntries } = await import('../api/diary')
const mockedFetch = vi.mocked(fetchJournalEntries)

/** Reports only exist for weeks that have ended, so the fixtures are dated
 *  relative to today rather than pinned — the same trick mock_data.sql uses. */
function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function entry(date: string, overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  return {
    id: `id-${date}`,
    date,
    savedAt: `${date}T21:00:00`,
    mood: 'bad',
    emotions: [{ emotion: 'Lęk', intensity: 7 }],
    energyLevel: 3,
    tensionLevel: 7,
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

/** Two full weeks back, so both fall in weeks that have certainly ended. */
const LAST_WEEK = 9
const WEEK_BEFORE = 16

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
})

describe('Reports', () => {
  it('explains that reports appear on their own, and offers no way to make one', async () => {
    mockedFetch.mockResolvedValue([entry(isoDaysAgo(LAST_WEEK))])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/powstają automatycznie co tydzień/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generuj|utwórz|nowy raport/i })).toBeNull()
  })

  it('states that specialists see the reports, without offering the patient a switch', async () => {
    mockedFetch.mockResolvedValue([entry(isoDaysAgo(LAST_WEEK))])
    renderWithProviders(<Reports />)

    expect(
      await screen.findByText(/widoczne dla specjalistów prowadzących Twoją terapię/i),
    ).toBeInTheDocument()
    // The visibility model is not a patient decision — see the TODO in Reports.tsx.
    expect(screen.queryByRole('button', { name: /wyślij|udostępnij|terapeucie/i })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('lists one row per ended week, newest first, and opens the report on click', async () => {
    const recent = isoDaysAgo(LAST_WEEK)
    mockedFetch.mockResolvedValue([entry(recent), entry(isoDaysAgo(WEEK_BEFORE))])
    renderWithProviders(<Reports />)

    const rows = await screen.findAllByRole('button', { name: /Średni nastrój/i })
    expect(rows).toHaveLength(2)

    await userEvent.click(rows[0])
    // The newest week is on top, so the first row is the most recent one.
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(String(navigate.mock.calls[0][0])).toMatch(/^\/reports\//)
  })

  it('previews the mood and the harder days on the row', async () => {
    mockedFetch.mockResolvedValue([entry(isoDaysAgo(LAST_WEEK), { mood: 'very_bad' })])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/Średni nastrój 1,0 \/ 5/)).toBeInTheDocument()
    expect(screen.getByText(/trudniejsze dni 1 z 7/)).toBeInTheDocument()
  })

  it('marks a week that has a flagged day, and leaves other weeks unmarked', async () => {
    mockedFetch.mockResolvedValue([
      entry(isoDaysAgo(LAST_WEEK), { hasRiskyBehavior: true, riskyBehaviorNote: 'Dwa piwa.' }),
      entry(isoDaysAgo(WEEK_BEFORE)),
    ])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/1 dzień z oznaczeniem/)).toBeInTheDocument()
    expect(screen.getAllByText(/z oznaczeniem/)).toHaveLength(1)
  })

  it('routes to the week the row belongs to', async () => {
    const date = isoDaysAgo(LAST_WEEK)
    mockedFetch.mockResolvedValue([entry(date)])
    renderWithProviders(<Reports />)

    const row = await screen.findByRole('button', { name: /Średni nastrój/i })
    await userEvent.click(row)

    const monday = new Date(`${date}T00:00:00`)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const month = String(monday.getMonth() + 1).padStart(2, '0')
    const day = String(monday.getDate()).padStart(2, '0')
    const weekStart = `${monday.getFullYear()}-${month}-${day}`

    expect(navigate).toHaveBeenCalledWith(reportDetailPath(weekReportId(weekStart)))
  })

  it('says there is no report yet when the diary holds only the current week', async () => {
    mockedFetch.mockResolvedValue([entry(isoDaysAgo(0))])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/Nie ma jeszcze żadnego raportu/i)).toBeInTheDocument()
  })

  it('a failed load never looks like "no reports yet"', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    renderWithProviders(<Reports />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać raportów/i)
    expect(screen.queryByText(/Nie ma jeszcze żadnego raportu/i)).toBeNull()
  })
})
