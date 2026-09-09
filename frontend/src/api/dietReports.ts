/**
 * The diet module's weekly reports — a mapping layer, and nothing but.
 *
 * snake_case in, camelCase out. Nothing here computes, rounds or words
 * anything: §10's rows arrive already composed (see `types/dietReport.ts` for
 * why the sentences are built in Python), and a second opinion formed here
 * would be free to disagree with the one a PDF will print.
 *
 * EVERY PATH CARRIES THE `/api` PREFIX. `apiRequest` prepends nothing —
 * `BASE_URL` is the origin, empty for same-origin — so the prefix is the
 * caller's job. `api/diet.ts` got that wrong and the requests reached the Vite
 * dev server as page addresses; `api/client.test.ts` now refuses a path without
 * it.
 */

import { apiRequest } from './client'
import type {
  DietReport,
  DietReportSummary,
  InProgressWeek,
} from '../types/dietReport'

const REPORTS_URL = '/api/diet/reports/'

/** As `core.diet_reports.build_report_summary` sends it. */
interface DietReportRowPayload {
  key: string
  label: string
  value: string
}

interface DietReportPayload {
  id: string
  start: string
  end: string
  available_from: string
  week_days: number
  meal_count: number
  days_with_meals: number
  rows: DietReportRowPayload[]
  change_note: string | null
  missing: string[]
}

interface InProgressWeekPayload {
  start: string
  end: string
  closes_on: string
  meal_count: number
  days_with_meals: number
}

interface DietReportSummaryPayload {
  anchor: string | null
  in_progress: InProgressWeekPayload | null
  reports: DietReportPayload[]
}

function toReport(payload: DietReportPayload): DietReport {
  return {
    id: payload.id,
    start: payload.start,
    end: payload.end,
    availableFrom: payload.available_from,
    weekDays: payload.week_days,
    mealCount: payload.meal_count,
    daysWithMeals: payload.days_with_meals,
    // Passed through as sent, order included: the server decided which rows a
    // week has and in what order §10 lists them.
    rows: payload.rows.map((row) => ({
      key: row.key,
      label: row.label,
      value: row.value,
    })),
    changeNote: payload.change_note,
    missing: payload.missing,
  }
}

function toInProgress(payload: InProgressWeekPayload): InProgressWeek {
  return {
    start: payload.start,
    end: payload.end,
    closesOn: payload.closes_on,
    mealCount: payload.meal_count,
    daysWithMeals: payload.days_with_meals,
  }
}

/** The week in progress and every completed week that holds a meal. */
export async function fetchDietReports(): Promise<DietReportSummary> {
  const payload = await apiRequest<DietReportSummaryPayload>(REPORTS_URL)
  return {
    anchor: payload.anchor,
    inProgress: payload.in_progress ? toInProgress(payload.in_progress) : null,
    reports: payload.reports.map(toReport),
  }
}

/**
 * One week's report.
 *
 * A week nobody has entries for answers 404, exactly like another patient's
 * would — the `/api/diary/<id>/` convention, so nothing leaks about whether it
 * exists.
 */
export async function fetchDietReport(id: string): Promise<DietReport> {
  return toReport(await apiRequest<DietReportPayload>(`${REPORTS_URL}${id}/`))
}
