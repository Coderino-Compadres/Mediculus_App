/**
 * Entry frequency for a named year: /api/analysis/frequency/.
 *
 * A mapping layer like api/reports.ts, and here for the same reason that one
 * exists: the aggregation belongs on the server. The screen computes its 30- and
 * 90-day views itself, out of the entry list it already has, but a year further
 * back than `/api/diary/`'s 1000-row cap is not in that list at all — see
 * `backend/core/frequency.py`.
 *
 * The payload carries dates and counts, never Polish: 'sty'/'lut' are formatted
 * here, by the same `monthLabel` the rolling views use, so the two cannot drift.
 */

import { apiRequest } from './client'
import { monthLabel, rangeLabel } from '../utils/analysis'
import { fromIsoDate } from '../utils/days'
import type { FrequencyBucket, YearFrequency } from '../types/analysis'

interface BucketPayload {
  start: string
  end: string
  days: number
  length: number
  partial: boolean
}

interface FrequencyPayload {
  year: number
  bucket: 'month'
  years_with_entries: number[]
  buckets: BucketPayload[]
}

function toBucket(payload: BucketPayload): FrequencyBucket {
  const start = fromIsoDate(payload.start)
  return {
    // From `start`, not from an index: a year whose first bucket is clipped to
    // the patient's first entry still has to be labelled with its own month.
    label: monthLabel(start),
    days: payload.days,
    length: payload.length,
    partial: payload.partial,
    rangeLabel: rangeLabel(start, fromIsoDate(payload.end)),
  }
}

export async function fetchYearFrequency(year: number): Promise<YearFrequency> {
  const payload = await apiRequest<FrequencyPayload>(`/api/analysis/frequency/?year=${year}`)
  return {
    year: payload.year,
    yearsWithEntries: payload.years_with_entries,
    buckets: payload.buckets.map(toBucket),
  }
}
