import { describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ apiRequest: vi.fn(), apiDownload: vi.fn() }))
const { apiRequest, apiDownload } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)
const mockedDownload = vi.mocked(apiDownload)

const { fetchReportPdf, fetchWeeklyReport, fetchWeeklyReports, reportPdfFileName, saveBlob } =
  await import('./reports')

/** One report as core/reports.py serialises it. */
const PAYLOAD = {
  id: 'week-2026-08-10',
  week_start: '2026-08-10',
  week_end: '2026-08-16',
  range_label: '10 – 16 sierpnia 2026',
  entry_count: 3,
  metrics: [{
    key: 'mood' as const,
    label: 'Średni nastrój',
    value: '3,0 / 5',
    delta: { value: 0.5, gap: null, decimals: 1 as const, unit: '', tone: 'good' as const },
  }],
  emotions: [{ emotion: 'Lęk', days: 3 }],
  triggers: [{ trigger: 'Praca', days: 2 }],
  risky_days: [{ entry_id: 'id-1', date: '2026-08-11', note_preview: 'Dwa piwa.' }],
  changes: [{
    label: 'Nastrój',
    delta: { value: 0.5, gap: null, decimals: 1 as const, unit: '', tone: 'good' as const },
  }],
  summary: 'W tym tygodniu masz 3 wpisy z 7 dni.',
}

describe('fetchWeeklyReports', () => {
  it('maps the snake_case columns onto what the screens read', async () => {
    mockedRequest.mockResolvedValueOnce([PAYLOAD])

    const [report] = await fetchWeeklyReports()

    expect(report.weekStart).toBe('2026-08-10')
    expect(report.weekEnd).toBe('2026-08-16')
    expect(report.rangeLabel).toBe('10 – 16 sierpnia 2026')
    expect(report.entryCount).toBe(3)
    expect(report.summary).toBe('W tym tygodniu masz 3 wpisy z 7 dni.')
  })

  it('maps a risky day onto the fields the link is built from', async () => {
    mockedRequest.mockResolvedValueOnce([PAYLOAD])

    const [report] = await fetchWeeklyReports()

    expect(report.riskyDays).toEqual([
      { entryId: 'id-1', date: '2026-08-11', notePreview: 'Dwa piwa.' },
    ])
  })

  it('keeps the delta a structure rather than a rendered string', async () => {
    // The card, the chip and the PDF each word it differently — see utils/reports.ts.
    mockedRequest.mockResolvedValueOnce([PAYLOAD])

    const [report] = await fetchWeeklyReports()

    expect(report.metrics[0].delta).toEqual({
      value: 0.5, gap: null, decimals: 1, unit: '', tone: 'good',
    })
  })

  it('an empty list is a diary with no finished week, not an error', async () => {
    mockedRequest.mockResolvedValueOnce([])

    expect(await fetchWeeklyReports()).toEqual([])
  })
})

describe('fetchWeeklyReport', () => {
  it('addresses one week by its id', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    const report = await fetchWeeklyReport('week-2026-08-10')

    expect(mockedRequest).toHaveBeenCalledWith('/api/reports/week-2026-08-10/')
    expect(report.id).toBe('week-2026-08-10')
  })

  it('escapes whatever the route handed over', async () => {
    // The id comes from a URL the user can type; it must not be able to reach a
    // different path.
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await fetchWeeklyReport('../diary')

    expect(mockedRequest).toHaveBeenCalledWith('/api/reports/..%2Fdiary/')
  })
})

describe('the PDF', () => {
  it('asks for the file under the report it belongs to', async () => {
    mockedDownload.mockResolvedValueOnce(new Blob(['%PDF-']))

    await fetchReportPdf('week-2026-08-10')

    expect(mockedDownload).toHaveBeenCalledWith('/api/reports/week-2026-08-10/pdf/')
  })

  it('names the file the way Content-Disposition does', async () => {
    // core/report_pdf.py pdf_file_name — the two have to agree, or the header
    // and the saved file disagree about what the document is.
    mockedRequest.mockResolvedValueOnce(PAYLOAD)
    const report = await fetchWeeklyReport('week-2026-08-10')

    expect(reportPdfFileName(report)).toBe('raport-tygodniowy-2026-08-10.pdf')
  })

  it('revokes the object URL it created, so an export does not leak a blob', () => {
    const created = vi.fn(() => 'blob:x')
    const revoked = vi.fn()
    URL.createObjectURL = created as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revoked as unknown as typeof URL.revokeObjectURL
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    saveBlob(new Blob(['%PDF-']), 'raport.pdf')

    expect(click).toHaveBeenCalled()
    expect(revoked).toHaveBeenCalledWith('blob:x')
    // And the anchor does not stay behind in the document.
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })
})
