import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { WEEK_A, WEEK_B, reportFixture } from '../test/reportFixture'
import Reports from './Reports'
import { reportDetailPath } from '../routes'
import { ApiError } from '../api/client'
import { PAGE_SIZE } from '../hooks/usePagination'

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

/** `count` reports, newest first, each on its own week. */
function manyReports(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const day = String(28 - (index % 28)).padStart(2, '0')
    return reportFixture({
      weekStart: `2026-0${1 + Math.floor(index / 28)}-${day}`,
      rangeLabel: `tydzień ${index + 1}`,
    })
  })
}

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

  it('a long history is paginated rather than truncated', async () => {
    mockedFetch.mockResolvedValue(manyReports(30))
    renderWithProviders(<Reports />)

    expect(await screen.findAllByRole('button', { name: /Średni nastrój/i })).toHaveLength(PAGE_SIZE)
    expect(screen.getByText(/z 30 raportów/)).toBeInTheDocument()
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

describe('Reports — trying again', () => {
  it('offers a button rather than telling the reader to reload the page', async () => {
    // "Spróbuj ponownie" as plain text is advice with nothing to act on, and a
    // standalone PWA has hidden the browser's reload button.
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))
    renderWithProviders(<Reports />)

    await screen.findByRole('alert')

    expect(screen.getByRole('button', { name: /spróbuj ponownie/i })).toBeInTheDocument()
  })

  it('re-runs the load and shows what arrives', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))
    mockedFetch.mockResolvedValueOnce([NEWEST])
    renderWithProviders(<Reports />)

    await userEvent.click(await screen.findByRole('button', { name: /spróbuj ponownie/i }))

    expect(await screen.findByRole('button', { name: /Średni nastrój/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the error when the second attempt fails too', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    renderWithProviders(<Reports />)

    await userEvent.click(await screen.findByRole('button', { name: /spróbuj ponownie/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })
})

describe('Reports — pagination', () => {
  const nextPage = () => screen.getByRole('button', { name: /następna/i })
  const prevPage = () => screen.getByRole('button', { name: /poprzednia/i })

  it('shows seven reports on a page', async () => {
    mockedFetch.mockResolvedValue(manyReports(20))
    renderWithProviders(<Reports />)

    expect(await screen.findAllByRole('button', { name: /Średni nastrój/i })).toHaveLength(7)
  })

  it('draws no control when everything fits on one page', async () => {
    // A control that can only be pressed to no effect is worse than none.
    mockedFetch.mockResolvedValue(manyReports(PAGE_SIZE))
    renderWithProviders(<Reports />)

    await screen.findAllByRole('button', { name: /Średni nastrój/i })

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('says which page the reader is on and how many there are', async () => {
    mockedFetch.mockResolvedValue(manyReports(20))
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/Strona 1 z 3/)).toBeInTheDocument()
  })

  it('moves to the next page and shows the next seven', async () => {
    mockedFetch.mockResolvedValue(manyReports(20))
    renderWithProviders(<Reports />)
    await screen.findAllByRole('button', { name: /Średni nastrój/i })

    await userEvent.click(nextPage())

    expect(screen.getByText('tydzień 8')).toBeInTheDocument()
    expect(screen.queryByText('tydzień 1')).toBeNull()
  })

  it('the last page holds the remainder', async () => {
    mockedFetch.mockResolvedValue(manyReports(16))
    renderWithProviders(<Reports />)
    await screen.findAllByRole('button', { name: /Średni nastrój/i })

    await userEvent.click(nextPage())
    await userEvent.click(nextPage())

    expect(screen.getAllByRole('button', { name: /Średni nastrój/i })).toHaveLength(2)
    expect(screen.getByText(/15–16 z 16/)).toBeInTheDocument()
  })

  it('cannot step past either end', async () => {
    mockedFetch.mockResolvedValue(manyReports(10))
    renderWithProviders(<Reports />)
    await screen.findAllByRole('button', { name: /Średni nastrój/i })

    expect(prevPage()).toBeDisabled()

    await userEvent.click(nextPage())

    expect(nextPage()).toBeDisabled()
    expect(prevPage()).toBeEnabled()
  })

  it('starts on the page the URL names', async () => {
    // What makes coming back from a report land where the reader left.
    mockedFetch.mockResolvedValue(manyReports(20))
    renderWithProviders(<Reports />, { route: '/reports?page=3' })

    expect(await screen.findByText(/Strona 3 z 3/)).toBeInTheDocument()
  })

  it('clamps a page number past the end rather than showing nothing', async () => {
    mockedFetch.mockResolvedValue(manyReports(10))
    renderWithProviders(<Reports />, { route: '/reports?page=99' })

    expect(await screen.findByText(/Strona 2 z 2/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Średni nastrój/i })).toHaveLength(3)
  })

  it('falls back to the first page when the parameter is not a number', async () => {
    mockedFetch.mockResolvedValue(manyReports(20))
    renderWithProviders(<Reports />, { route: '/reports?page=abc' })

    expect(await screen.findByText(/Strona 1 z 3/)).toBeInTheDocument()
  })

  it('an empty list draws no pagination and keeps its own wording', async () => {
    mockedFetch.mockResolvedValue([])
    renderWithProviders(<Reports />)

    expect(await screen.findByText(/Nie ma jeszcze żadnego raportu/i)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })
})

describe('Reports — the two chips on a row', () => {
  it('names the strongest emotions and labels them with the intensity', async () => {
    /** The row surfaces the top of the same ranking the detail screen draws,
     *  which is ordered by intensity — so the chip has to say the intensity.
     *  It used to read "Lęk 6 dni", which explained a strongest-first row with
     *  a frequency. */
    mockedFetch.mockResolvedValue([
      reportFixture({
        emotions: [
          { emotion: 'Spokój', days: 6, avgIntensity: 6.3 },
          { emotion: 'Radość', days: 4, avgIntensity: 6.25 },
          { emotion: 'Smutek', days: 5, avgIntensity: 0.8 },
        ],
      }),
    ])

    renderWithProviders(<Reports />)

    expect(await screen.findByText('Spokój 6,3/10')).toBeInTheDocument()
    expect(screen.getByText('Radość 6,3/10')).toBeInTheDocument()
    // Only two, so the row stays a summary rather than a second ranking.
    expect(screen.queryByText(/Smutek/)).toBeNull()
  })
})
