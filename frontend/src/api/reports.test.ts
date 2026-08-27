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
  emotions: [{ emotion: 'Lęk', days: 3, avg_intensity: 6.5 }],
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

describe('mapping the edges of the payload', () => {
  it('an empty section stays an empty array rather than becoming undefined', async () => {
    mockedRequest.mockResolvedValueOnce([{
      ...PAYLOAD, emotions: [], triggers: [], risky_days: [], changes: [],
    }])

    const [report] = await fetchWeeklyReports()

    expect(report.emotions).toEqual([])
    expect(report.triggers).toEqual([])
    expect(report.riskyDays).toEqual([])
    expect(report.changes).toEqual([])
  })

  it('carries both reasons a delta can have no number', async () => {
    // The screen words them differently; collapsing them here would make that
    // impossible downstream.
    mockedRequest.mockResolvedValueOnce([{
      ...PAYLOAD,
      metrics: [
        { ...PAYLOAD.metrics[0], delta: { value: null, gap: 'no-previous-week' as const, decimals: 1 as const, unit: '', tone: 'neutral' as const } },
        { ...PAYLOAD.metrics[0], key: 'stress' as const, delta: { value: null, gap: 'unrated' as const, decimals: 1 as const, unit: '', tone: 'neutral' as const } },
      ],
    }])

    const [report] = await fetchWeeklyReports()

    expect(report.metrics[0].delta.gap).toBe('no-previous-week')
    expect(report.metrics[1].delta.gap).toBe('unrated')
  })

  it('keeps a zero delta as zero rather than losing it to a falsy check', async () => {
    mockedRequest.mockResolvedValueOnce([{
      ...PAYLOAD,
      metrics: [{ ...PAYLOAD.metrics[0], delta: { value: 0, gap: null, decimals: 1 as const, unit: '', tone: 'neutral' as const } }],
    }])

    const [report] = await fetchWeeklyReports()

    expect(report.metrics[0].delta.value).toBe(0)
    expect(report.metrics[0].delta.gap).toBeNull()
  })

  it('keeps an entry count of zero rather than treating it as missing', async () => {
    mockedRequest.mockResolvedValueOnce([{ ...PAYLOAD, entry_count: 0 }])

    const [report] = await fetchWeeklyReports()

    expect(report.entryCount).toBe(0)
  })

  it('maps every report in a list, not only the first', async () => {
    mockedRequest.mockResolvedValueOnce([
      PAYLOAD, { ...PAYLOAD, id: 'week-2026-08-03', week_start: '2026-08-03' },
    ])

    const reports = await fetchWeeklyReports()

    expect(reports.map((report) => report.weekStart)).toEqual(['2026-08-10', '2026-08-03'])
  })

  it('an empty note preview survives as an empty string', async () => {
    // '' is a day flagged with no description — a real state the screen words
    // differently from a missing one.
    mockedRequest.mockResolvedValueOnce([{
      ...PAYLOAD,
      risky_days: [{ entry_id: 'id-1', date: '2026-08-11', note_preview: '' }],
    }])

    const [report] = await fetchWeeklyReports()

    expect(report.riskyDays[0].notePreview).toBe('')
  })

  it('does not reorder what the server ranked', async () => {
    mockedRequest.mockResolvedValueOnce([{
      ...PAYLOAD,
      emotions: [
        { emotion: 'Smutek', days: 1, avg_intensity: 2 },
        { emotion: 'Lęk', days: 1, avg_intensity: 9 },
      ],
    }])

    const [report] = await fetchWeeklyReports()

    expect(report.emotions.map((row) => row.emotion)).toEqual(['Smutek', 'Lęk'])
  })

  it('a failure from the request layer is not swallowed', async () => {
    mockedRequest.mockRejectedValueOnce(new Error('network down'))

    await expect(fetchWeeklyReports()).rejects.toThrow('network down')
  })
})

describe('saveBlob', () => {
  function stubDownload() {
    URL.createObjectURL = vi.fn(() => 'blob:x') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
    return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  }

  it('names the file from what it was given', () => {
    const click = stubDownload()
    let seen = ''
    click.mockImplementation(function (this: HTMLAnchorElement) { seen = this.download })

    saveBlob(new Blob(['%PDF-']), 'raport-tygodniowy-2026-08-10.pdf')

    expect(seen).toBe('raport-tygodniowy-2026-08-10.pdf')
    click.mockRestore()
  })

  it('leaves no anchor behind in the document', () => {
    const click = stubDownload()
    const before = document.body.childElementCount

    saveBlob(new Blob(['%PDF-']), 'raport.pdf')

    expect(document.body.childElementCount).toBe(before)
    click.mockRestore()
  })
})

describe('the average intensity of an emotion', () => {
  it('is mapped onto the camelCase field the ranking reads', async () => {
    mockedRequest.mockResolvedValueOnce([PAYLOAD])

    const [report] = await fetchWeeklyReports()

    expect(report.emotions[0]).toEqual({ emotion: 'Lęk', days: 3, avgIntensity: 6.5 })
  })

  it('keeps an average of zero rather than losing it to a falsy check', async () => {
    // 0 is a rating the patient gave; dropping it would blank the second number
    // on exactly the calmest rows.
    mockedRequest.mockResolvedValueOnce([{
      ...PAYLOAD, emotions: [{ emotion: 'Spokój', days: 2, avg_intensity: 0 }],
    }])

    const [report] = await fetchWeeklyReports()

    expect(report.emotions[0].avgIntensity).toBe(0)
  })
})
