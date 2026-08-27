/**
 * The weekly reports: /api/reports/.
 *
 * Reports are generated on the server from diary entries and nothing else, so
 * this module is a mapping layer like api/dashboard.ts — snake_case columns in,
 * the camelCase `WeeklyReport` the screens render out. It used to be an
 * aggregation (utils/reports.ts, now formatting only): deriving the numbers in
 * the browser meant one document per browser, and a report a specialist reads
 * has to be the same for everyone who opens it.
 */

import { apiDownload, apiRequest } from './client'
import type {
  Delta,
  EmotionSummary,
  ReportChangeChip,
  ReportMetric,
  RiskyDay,
  TriggerDays,
  WeeklyReport,
} from '../types/report'
import type { EmotionName } from '../utils/emotions'

interface DeltaPayload {
  value: number | null
  gap: Delta['gap']
  decimals: 0 | 1
  unit: string
  tone: Delta['tone']
}

interface ReportPayload {
  id: string
  week_start: string
  week_end: string
  range_label: string
  entry_count: number
  metrics: { key: ReportMetric['key']; label: string; value: string; delta: DeltaPayload }[]
  emotions: { emotion: string; days: number; avg_intensity: number }[]
  triggers: { trigger: string; days: number }[]
  risky_days: { entry_id: string; date: string; note_preview: string }[]
  changes: { label: string; delta: DeltaPayload }[]
  summary: string
}

function toDelta(payload: DeltaPayload): Delta {
  return {
    value: payload.value,
    gap: payload.gap,
    decimals: payload.decimals,
    unit: payload.unit,
    tone: payload.tone,
  }
}

function toReport(payload: ReportPayload): WeeklyReport {
  return {
    id: payload.id,
    weekStart: payload.week_start,
    weekEnd: payload.week_end,
    rangeLabel: payload.range_label,
    entryCount: payload.entry_count,
    metrics: payload.metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      value: metric.value,
      delta: toDelta(metric.delta),
    })),
    // The backend sends the same ten names core/emotions.py declares, which
    // test_emotions.py pins against utils/emotions.ts character for character.
    emotions: payload.emotions.map(
      (row): EmotionSummary => ({
        emotion: row.emotion as EmotionName,
        days: row.days,
        avgIntensity: row.avg_intensity,
      }),
    ),
    triggers: payload.triggers.map((row): TriggerDays => ({ trigger: row.trigger, days: row.days })),
    riskyDays: payload.risky_days.map(
      (row): RiskyDay => ({ entryId: row.entry_id, date: row.date, notePreview: row.note_preview }),
    ),
    changes: payload.changes.map(
      (chip): ReportChangeChip => ({ label: chip.label, delta: toDelta(chip.delta) }),
    ),
    summary: payload.summary,
  }
}

export async function fetchWeeklyReports(): Promise<WeeklyReport[]> {
  const payload = await apiRequest<ReportPayload[]>('/api/reports/')
  return payload.map(toReport)
}

/** One report by its week id. A week with no entries answers 404, the same as
 *  somebody else's would — neither tells the patient anything they can act on. */
export async function fetchWeeklyReport(id: string): Promise<WeeklyReport> {
  return toReport(await apiRequest<ReportPayload>(`/api/reports/${encodeURIComponent(id)}/`))
}

/** The same report as a PDF, rendered by the server. */
export async function fetchReportPdf(id: string): Promise<Blob> {
  return apiDownload(`/api/reports/${encodeURIComponent(id)}/pdf/`)
}

/** Matches `pdf_file_name` in core/report_pdf.py, which is what the
 *  Content-Disposition header carries. Kept here too because a blob download
 *  names the file from the client side. */
export function reportPdfFileName(report: WeeklyReport): string {
  return `raport-tygodniowy-${report.weekStart}.pdf`
}

/**
 * Hands the browser a file to save.
 *
 * A blob URL rather than pointing an <a> at the API: the request has to carry
 * the session cookie and its failures have to reach the UI, and this is what
 * turns the fetched bytes back into a download afterwards. The object URL is
 * revoked immediately — the browser has already taken its own reference by the
 * time click() returns.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
