import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchYearFrequency } from './analysis'

vi.mock('./client', () => ({ apiRequest: vi.fn() }))
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

function payload(overrides: Record<string, unknown> = {}) {
  return {
    year: 2025,
    bucket: 'month',
    years_with_entries: [2025, 2026],
    buckets: [
      { start: '2025-01-02', end: '2025-01-31', days: 28, length: 30, partial: true },
      { start: '2025-02-01', end: '2025-02-28', days: 21, length: 28, partial: false },
    ],
    ...overrides,
  }
}

beforeEach(() => mockedRequest.mockReset())

describe('fetchYearFrequency', () => {
  it('asks the API path, not a path the SPA fallback would swallow', async () => {
    // The one thing a mocked-module page test cannot catch: every other module
    // here passes '/api/...', and BASE_URL is empty in development, so a path
    // missing the prefix is served index.html with a 200 rather than failing
    // loudly. That is exactly how this shipped broken once.
    mockedRequest.mockResolvedValueOnce(payload())
    await fetchYearFrequency(2025)
    expect(mockedRequest).toHaveBeenCalledWith('/api/analysis/frequency/?year=2025')
  })

  it('carries the years the picker is built from', async () => {
    mockedRequest.mockResolvedValueOnce(payload())
    expect((await fetchYearFrequency(2025)).yearsWithEntries).toEqual([2025, 2026])
  })

  it('labels a bucket from its own start date', async () => {
    // Not from its index: a year whose first bucket is clipped to the patient's
    // first entry still has to be labelled with the month it belongs to.
    mockedRequest.mockResolvedValueOnce(payload())
    const [january, february] = (await fetchYearFrequency(2025)).buckets
    expect(january.label).toBe('sty')
    expect(february.label).toBe('lut')
  })

  it('keeps the server\'s own length and partial flag', async () => {
    // The clipping rules live in backend/core/frequency.py; re-deriving them
    // here would be a second implementation that can disagree.
    mockedRequest.mockResolvedValueOnce(payload())
    const [january] = (await fetchYearFrequency(2025)).buckets
    expect([january.days, january.length, january.partial]).toEqual([28, 30, true])
  })

  it('builds a range label out of the two dates', async () => {
    mockedRequest.mockResolvedValueOnce(payload())
    expect((await fetchYearFrequency(2025)).buckets[1].rangeLabel).toBe('1 – 28 lutego')
  })
})
