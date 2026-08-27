import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { WEEK_A, WEEK_B, reportFixture } from '../test/reportFixture'
import Reports from './Reports'
import { reportDetailPath } from '../routes'
import { ApiError } from '../api/client'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../api/reports', () => ({ fetchWeeklyReports: vi.fn() }))
const { fetchWeeklyReports } = await import('../api/reports')
const mockedFetch = vi.mocked(fetchWeeklyReports)

/** Newest first, as GET /api/reports/ returns them. */
const NEWEST = reportFixture({ weekStart: WEEK_B })
const OLDER = reportFixture({
  weekStart: WEEK_A, weekEnd: '2026-08-09', rangeLabel: '3 – 9 sierpnia 2026',
})

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
})

describe('Reports', () => {
  it('explains that reports appear on their own, and offers no way to make one', async () => {
    mockedFetch.mockResolvedValue([NEWEST])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/powstają automatycznie co tydzień/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generuj|utwórz|nowy raport/i })).toBeNull()
  })

  it('states that specialists see the reports, without offering the patient a switch', async () => {
    mockedFetch.mockResolvedValue([NEWEST])
    renderWithProviders(<Reports />)

    expect(
      await screen.findByText(/widoczne dla specjalistów prowadzących Twoją terapię/i),
    ).toBeInTheDocument()
    // The visibility model is not a patient decision — see the TODO in Reports.tsx.
    expect(screen.queryByRole('button', { name: /wyślij|udostępnij|terapeucie/i })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('draws one row per report, in the order the server sent them', async () => {
    mockedFetch.mockResolvedValue([NEWEST, OLDER])
    renderWithProviders(<Reports />)

    const rows = await screen.findAllByRole('button', { name: /Średni nastrój/i })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('10 – 16 sierpnia 2026')
    expect(rows[1]).toHaveTextContent('3 – 9 sierpnia 2026')
  })

  it('previews the mood and the harder days on the row', async () => {
    mockedFetch.mockResolvedValue([NEWEST])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/Średni nastrój 3,0 \/ 5/)).toBeInTheDocument()
    expect(screen.getByText(/trudniejsze dni 1 z 7/i)).toBeInTheDocument()
  })

  it('marks a week that has a flagged day, and leaves other weeks unmarked', async () => {
    mockedFetch.mockResolvedValue([
      reportFixture({
        riskyDays: [{ entryId: 'id-1', date: '2026-08-11', notePreview: 'Dwa piwa.' }],
      }),
      OLDER,
    ])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/1 dzień z oznaczeniem/)).toBeInTheDocument()
    expect(screen.getAllByText(/z oznaczeniem/)).toHaveLength(1)
  })

  it('opens the report the row belongs to, by the id the server gave it', async () => {
    mockedFetch.mockResolvedValue([NEWEST])
    renderWithProviders(<Reports />)

    await userEvent.click(await screen.findByRole('button', { name: /Średni nastrój/i }))

    expect(navigate).toHaveBeenCalledWith(reportDetailPath(NEWEST.id))
  })

  it('says there is no report yet when the server has none', async () => {
    mockedFetch.mockResolvedValue([])
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

describe('Reports — while and after loading', () => {
  it('says it is loading rather than showing an empty list first', async () => {
    let release: (reports: never[]) => void = () => {}
    mockedFetch.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderWithProviders(<Reports />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(/Nie ma jeszcze żadnego raportu/i)).toBeNull()

    release([])
    expect(await screen.findByText(/Nie ma jeszcze żadnego raportu/i)).toBeInTheDocument()
  })

  it('asks the server once, not once per row', async () => {
    mockedFetch.mockResolvedValue([NEWEST, OLDER])
    renderWithProviders(<Reports />)

    await screen.findAllByRole('button', { name: /Średni nastrój/i })

    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('renders a week with nothing rated without falling over', async () => {
    mockedFetch.mockResolvedValue([reportFixture({
      entryCount: 1,
      emotions: [],
      triggers: [],
      changes: [],
      metrics: reportFixture().metrics.map((metric) => ({ ...metric, value: '— / 5' })),
    })])
    renderWithProviders(<Reports />)

    expect(await screen.findByRole('button', { name: /Średni nastrój/i })).toBeInTheDocument()
  })

  it('draws a long history without dropping rows', async () => {
    const many = Array.from({ length: 30 }, (_, index) => reportFixture({
      weekStart: `2026-0${1 + Math.floor(index / 28)}-${String((index % 28) + 1).padStart(2, '0')}`,
    }))
    mockedFetch.mockResolvedValue(many)
    renderWithProviders(<Reports />)

    expect(await screen.findAllByRole('button', { name: /Średni nastrój/i })).toHaveLength(30)
  })

  it('carries the server error message when there is one', async () => {
    mockedFetch.mockRejectedValue(new ApiError(403, 'Raporty są dostępne tylko dla konta pacjenta.'))
    renderWithProviders(<Reports />)

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Raporty są dostępne tylko dla konta pacjenta.')
  })

  it('survives a failure that is not an ApiError at all', async () => {
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    renderWithProviders(<Reports />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać raportów/i)
  })
})
