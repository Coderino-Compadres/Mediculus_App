import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { WEEK_B, delta, reportFixture } from '../test/reportFixture'
import ReportDetail from './ReportDetail'
import { ROUTES, journalDetailPath } from '../routes'
import { ApiError } from '../api/client'
import { EMOTION_COLORS } from '../utils/emotions'

const navigate = vi.fn()
/** The screen reads its week out of the route, so :id has to be a real param. */
let routeId = `week-${WEEK_B}`

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: routeId }) }
})

vi.mock('../api/reports', async (importOriginal) => ({
  // reportPdfFileName and saveBlob are plain functions the screen composes with
  // the two requests; keeping them real is what lets a download test assert on
  // the file name the browser is actually handed.
  ...(await importOriginal<typeof import('../api/reports')>()),
  fetchWeeklyReport: vi.fn(),
  fetchReportPdf: vi.fn(),
}))
const { fetchWeeklyReport, fetchReportPdf } = await import('../api/reports')
const mockedFetch = vi.mocked(fetchWeeklyReport)
const mockedPdf = vi.mocked(fetchReportPdf)

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
  mockedPdf.mockReset()
  routeId = `week-${WEEK_B}`
})

describe('ReportDetail', () => {
  it('shows the week it covers and the two header actions, and nothing that shares it', async () => {
    mockedFetch.mockResolvedValue(reportFixture())
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByRole('heading', { name: 'Raport' })).toBeInTheDocument()
    expect(screen.getAllByText('10 – 16 sierpnia 2026').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pełna analiza' })).toHaveAttribute('href', ROUTES.analysis)
    // Sharing is the specialist's side of the model, not a button here.
    expect(screen.queryByRole('button', { name: /wyślij|udostępnij/i })).toBeNull()
  })

  it('asks the server for the week in the route, not for the whole diary', async () => {
    mockedFetch.mockResolvedValue(reportFixture())
    renderWithProviders(<ReportDetail />)

    await screen.findByRole('heading', { name: 'Raport' })
    expect(mockedFetch).toHaveBeenCalledWith(`week-${WEEK_B}`)
  })

  it('draws the four metric cards, each with its change against the previous week', async () => {
    mockedFetch.mockResolvedValue(reportFixture())
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Średni nastrój')).toBeInTheDocument()
    expect(screen.getByText('Średni poziom stresu')).toBeInTheDocument()
    expect(screen.getByText('Średni poziom energii')).toBeInTheDocument()
    expect(screen.getByText('Trudniejsze dni')).toBeInTheDocument()
    expect(screen.getByText('+0,5 od poprzedniego tygodnia')).toBeInTheDocument()
  })

  it('says plainly when there is no previous week, instead of implying a drop to zero', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      metrics: reportFixture().metrics.map((metric) => ({ ...metric, delta: delta() })),
    }))
    renderWithProviders(<ReportDetail />)

    expect(
      (await screen.findAllByText('brak poprzedniego tygodnia do porównania')).length,
    ).toBe(4)
  })

  it('colours the emotion bars from the shared palette', async () => {
    mockedFetch.mockResolvedValue(reportFixture({ emotions: [{ emotion: 'Lęk', days: 3, avgIntensity: 6.5 }] }))
    const { container } = renderWithProviders(<ReportDetail />)

    await screen.findByText('Najczęściej odczuwane emocje')
    const fills = container.querySelectorAll<HTMLElement>('.report-ranking-fill')

    expect(fills[0].style.backgroundColor).toBe('rgb(155, 133, 196)')
    expect(EMOTION_COLORS['Lęk'].toUpperCase()).toBe('#9B85C4')
  })

  it('ranks the triggers the server counted', async () => {
    mockedFetch.mockResolvedValue(reportFixture())
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Najczęstsze wyzwalacze')).toBeInTheDocument()
    expect(screen.getByText('Praca')).toBeInTheDocument()
    expect(screen.getByText('Dom')).toBeInTheDocument()
  })

  it('keeps the risky-behaviour section visible on a week with none', async () => {
    mockedFetch.mockResolvedValue(reportFixture({ riskyDays: [] }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Zachowania ryzykowne')).toBeInTheDocument()
    expect(screen.getByText('Brak oznaczonych zachowań ryzykownych w tym tygodniu.')).toBeInTheDocument()
  })

  it('lists a flagged day with a preview and a link into the diary entry', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      riskyDays: [{
        entryId: 'id-2026-08-11', date: '2026-08-11', notePreview: 'Wieczorem dwa piwa.',
      }],
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText(/Zachowanie ryzykowne oznaczone w 1 z 7 dni/)).toBeInTheDocument()
    expect(screen.getByText('Wieczorem dwa piwa.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /wtorek, 11 sierpnia/i }))
      .toHaveAttribute('href', journalDetailPath('id-2026-08-11'))
  })

  it('says a flagged day carries no description rather than showing an empty row', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      riskyDays: [{ entryId: 'id-2026-08-11', date: '2026-08-11', notePreview: '' }],
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Dzień oznaczony bez opisu.')).toBeInTheDocument()
  })

  it('sums the week up and chips the changes with a direction and a value', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      changes: [
        { label: 'Nastrój', delta: delta({ value: 2, gap: null, tone: 'good' }) },
        { label: 'Napięcie', delta: delta({ value: 3, gap: null, tone: 'watch' }) },
      ],
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText('Podsumowanie tygodnia')).toBeInTheDocument()
    expect(screen.getByText('Nastrój +2,0')).toBeInTheDocument()
    expect(screen.getByText('Napięcie +3,0')).toBeInTheDocument()
  })

  it('wording for an id with no week behind it does not imply the report exists', async () => {
    mockedFetch.mockRejectedValue(new ApiError(404, 'Nie znaleziono raportu dla tego tygodnia.'))
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
    mockedFetch.mockResolvedValue(reportFixture())
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Wróć do Raportów' }))

    expect(navigate).toHaveBeenCalledWith(ROUTES.reports)
  })
})

describe('ReportDetail — the PDF export', () => {
  /** jsdom has no download machinery: createObjectURL is absent and a click on
   *  an <a download> does nothing. Stubbing both is what lets the test see the
   *  file name the browser would have been handed. */
  function captureDownload() {
    const created = vi.fn(() => 'blob:report')
    const revoked = vi.fn()
    URL.createObjectURL = created as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revoked as unknown as typeof URL.revokeObjectURL

    const clicked: { fileName?: string } = {}
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.fileName = this.download
    })
    return { clicked, created, revoked }
  }

  beforeEach(() => {
    mockedFetch.mockResolvedValue(reportFixture())
    return () => vi.restoreAllMocks()
  })

  async function clickDownload() {
    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))
  }

  it('asks the server for the file and hands it to the browser to save', async () => {
    const { clicked, created, revoked } = captureDownload()
    mockedPdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }))
    renderWithProviders(<ReportDetail />)

    await clickDownload()

    await waitFor(() => expect(mockedPdf).toHaveBeenCalledWith(`week-${WEEK_B}`))
    expect(clicked.fileName).toBe('raport-tygodniowy-2026-08-10.pdf')
    expect(created).toHaveBeenCalled()
    // Left un-revoked, every export leaks its blob for the life of the tab.
    expect(revoked).toHaveBeenCalled()
  })

  it('nothing is fetched until the button is pressed', async () => {
    captureDownload()
    mockedPdf.mockResolvedValue(new Blob(['%PDF-']))
    renderWithProviders(<ReportDetail />)

    await screen.findByRole('button', { name: 'Pobierz PDF' })

    expect(mockedPdf).not.toHaveBeenCalled()
  })

  it('locks the button while the document is being rendered', async () => {
    captureDownload()
    let release: (blob: Blob) => void = () => {}
    mockedPdf.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderWithProviders(<ReportDetail />)

    await clickDownload()

    expect(await screen.findByRole('button', { name: /przygotowywanie/i })).toBeDisabled()
    release(new Blob(['%PDF-']))
  })

  it('a failed export says so and leaves the report on screen', async () => {
    captureDownload()
    mockedPdf.mockRejectedValue(new ApiError(500, null))
    renderWithProviders(<ReportDetail />)

    await clickDownload()

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się pobrać raportu/i)
    expect(screen.getByRole('heading', { name: 'Raport' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeEnabled()
  })

  it('never claims a file is ready when none was written', async () => {
    captureDownload()
    mockedPdf.mockRejectedValue(new ApiError(500, null))
    renderWithProviders(<ReportDetail />)

    await clickDownload()

    await screen.findByRole('alert')
    expect(screen.queryByText(/gotowy/i)).toBeNull()
  })
})

describe('ReportDetail — loading and odd routes', () => {
  it('says it is loading rather than showing "not found" first', async () => {
    let release: (report: ReturnType<typeof reportFixture>) => void = () => {}
    mockedFetch.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderWithProviders(<ReportDetail />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Nie znaleziono takiego raportu.')).toBeNull()

    release(reportFixture())
    expect(await screen.findByRole('heading', { name: 'Raport' })).toBeInTheDocument()
  })

  it('asks for nothing when the route carries no id', async () => {
    routeId = ''
    renderWithProviders(<ReportDetail />)

    expect(mockedFetch).not.toHaveBeenCalled()
    expect(await screen.findByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
  })

  it('a 403 is an error, not a missing report', async () => {
    // The wording matters: "nie znaleziono" would tell a guardian their child's
    // week does not exist, when what happened is that they may not read it.
    mockedFetch.mockRejectedValue(new ApiError(403, 'Raporty są dostępne tylko dla konta pacjenta.'))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Raporty są dostępne tylko dla konta pacjenta.')
    expect(screen.queryByText('Nie znaleziono takiego raportu.')).toBeNull()
  })

  it('survives a failure that is not an ApiError at all', async () => {
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać tego raportu/i)
  })

  it('renders a report whose every section is empty', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      entryCount: 1, emotions: [], triggers: [], riskyDays: [], changes: [],
      metrics: reportFixture().metrics.map((metric) => ({
        ...metric, value: '— / 5', delta: delta(),
      })),
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByRole('heading', { name: 'Raport' })).toBeInTheDocument()
    expect(screen.getByText('Brak oznaczonych zachowań ryzykownych w tym tygodniu.'))
      .toBeInTheDocument()
  })

  it('lists every flagged day of a full week', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      riskyDays: Array.from({ length: 7 }, (_, index) => ({
        entryId: `id-${index}`,
        date: `2026-08-1${index}`,
        notePreview: `Notatka ${index}`,
      })),
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText(/oznaczone w 7 z 7 dni/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /sierpnia/i })).toHaveLength(7)
  })
})

describe('ReportDetail — the PDF export, harder cases', () => {
  function captureDownload() {
    URL.createObjectURL = vi.fn(() => 'blob:report') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
    return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  }

  beforeEach(() => {
    mockedFetch.mockResolvedValue(reportFixture())
    captureDownload()
    return () => vi.restoreAllMocks()
  })

  it('a double click does not render the document twice', async () => {
    let release: (blob: Blob) => void = () => {}
    mockedPdf.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))
    await userEvent.click(screen.getByRole('button', { name: /przygotowywanie/i }))

    expect(mockedPdf).toHaveBeenCalledTimes(1)
    release(new Blob(['%PDF-']))
  })

  it('a second attempt is possible after a failure', async () => {
    mockedPdf.mockRejectedValueOnce(new ApiError(500, null))
    mockedPdf.mockResolvedValueOnce(new Blob(['%PDF-']))
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Pobierz PDF' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(mockedPdf).toHaveBeenCalledTimes(2)
  })

  it('a throttled export is worded as a refusal, not as a missing report', async () => {
    mockedPdf.mockRejectedValue(new ApiError(429, null))
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Raport' })).toBeInTheDocument()
  })

  it('a report that vanished between load and export says so', async () => {
    mockedPdf.mockRejectedValue(new ApiError(404, 'Nie znaleziono raportu dla tego tygodnia.'))
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Nie znaleziono raportu dla tego tygodnia.')
  })

  it('the report stays readable while the file is being prepared', async () => {
    let release: (blob: Blob) => void = () => {}
    mockedPdf.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderWithProviders(<ReportDetail />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))

    expect(screen.getByText('Średni nastrój')).toBeInTheDocument()
    release(new Blob(['%PDF-']))
  })
})

describe('ReportDetail — how strongly, next to how often', () => {
  it('shows the average intensity beside the day count', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: [{ emotion: 'Smutek', days: 2, avgIntensity: 3 }],
    }))
    renderWithProviders(<ReportDetail />)

    await screen.findByText('Najczęściej odczuwane emocje')
    const row = screen.getByText('Smutek').closest('.report-ranking-row')

    expect(row).toHaveTextContent('2 dni')
    expect(row).toHaveTextContent('śr. 3,0 / 10')
  })

  it('renders the scale so the number is not read as another count', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: [{ emotion: 'Lęk', days: 1, avgIntensity: 6.5 }],
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText(/śr\. 6,5 \/ 10/)).toBeInTheDocument()
  })

  it('an average of zero is shown rather than hidden', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: [{ emotion: 'Spokój', days: 3, avgIntensity: 0 }],
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText(/śr\. 0,0 \/ 10/)).toBeInTheDocument()
  })

  it('gives every rated emotion its own average', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: [
        { emotion: 'Lęk', days: 3, avgIntensity: 7 },
        { emotion: 'Smutek', days: 1, avgIntensity: 2.5 },
      ],
    }))
    renderWithProviders(<ReportDetail />)

    expect(await screen.findByText(/śr\. 7,0 \/ 10/)).toBeInTheDocument()
    expect(screen.getByText(/śr\. 2,5 \/ 10/)).toBeInTheDocument()
  })

  it('the triggers ranking shows no intensity, because a place has none', async () => {
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: [], triggers: [{ trigger: 'Praca', days: 2 }],
    }))
    renderWithProviders(<ReportDetail />)

    await screen.findByText('Najczęstsze wyzwalacze')

    expect(screen.getByText('Praca').closest('.report-ranking-row'))
      .not.toHaveTextContent('śr.')
  })

  it('draws every emotion the week rated, not a top few', async () => {
    const all = [
      'Radość', 'Smutek', 'Lęk', 'Złość', 'Stres',
      'Poczucie winy', 'Frustracja', 'Wstyd', 'Bezradność', 'Spokój',
    ] as const
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: all.map((emotion, index) => ({
        emotion, days: 1, avgIntensity: index,
      })),
    }))
    const { container } = renderWithProviders(<ReportDetail />)

    await screen.findByText('Najczęściej odczuwane emocje')

    for (const emotion of all) {
      expect(screen.getByText(emotion)).toBeInTheDocument()
    }
    // Two rankings share the component; only the emotions carry an average.
    expect(container.querySelectorAll('.report-ranking-average')).toHaveLength(all.length)
  })

  it('the bar still measures how often, not how strongly', async () => {
    // Otherwise a single very intense day would draw a longer bar than a
    // feeling that ran all week, under a heading that says "najczęściej".
    mockedFetch.mockResolvedValue(reportFixture({
      emotions: [
        { emotion: 'Smutek', days: 4, avgIntensity: 1 },
        { emotion: 'Lęk', days: 1, avgIntensity: 10 },
      ],
    }))
    const { container } = renderWithProviders(<ReportDetail />)

    await screen.findByText('Najczęściej odczuwane emocje')
    const fills = container.querySelectorAll<HTMLElement>('.report-ranking-fill')

    expect(fills[0].style.width).toBe('100%')
    expect(fills[1].style.width).toBe('25%')
  })
})
