import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import { fetchWeeklyReports } from '../api/reports'
import { DAYS_IN_WEEK, LEVEL_SCALE_MAX, formatDelta, formatNumber, pluralDays } from '../utils/reports'
import type { ReportMetric, WeeklyReport } from '../types/report'
import { usePagination } from '../hooks/usePagination'
import { reportDetailPath } from '../routes'
import './journals.css'
import './reports.css'

/**
 * The history of automatically generated weekly reports.
 *
 * The list is deliberately the same shape as "Dzienniczki": a row per period,
 * a preview of what is inside, and a tap into the detail view. A report is not
 * something the patient creates or configures — it appears once a week, on its
 * own, built from the diary entries of the week that just ended (both confirmed
 * with the client, alongside the rejection of a daily report as a copy of the
 * diary).
 *
 * The reports come from GET /api/reports/, generated on the server from the
 * diary entries and nothing else (core/reports.py) — so the numbers here cannot
 * drift from the entries they came from, and every reader of a given week gets
 * the same document.
 */

const LOAD_ERROR = 'Nie udało się wczytać raportów. Spróbuj ponownie.'

/** One of the four cards by key — the row previews two of them, the detail view all four. */
function metricByKey(report: WeeklyReport, key: ReportMetric['key']): ReportMetric | undefined {
  return report.metrics.find((metric) => metric.key === key)
}

function ReportRow({ report, onOpen }: { report: WeeklyReport; onOpen: () => void }) {
  const mood = metricByKey(report, 'mood')
  const hardDays = metricByKey(report, 'hardDays')
  const moodDelta = mood ? formatDelta(mood.delta) : null

  return (
    <button type="button" className="report-row" onClick={onOpen}>
      <span className="report-row-badge" aria-hidden="true">
        📄
      </span>
      <div className="journal-row-body">
        <div className="journal-row-top">
          <span className="journal-row-date">{report.rangeLabel}</span>
          {/* Present, never loud: the specialist needs to see at a glance which
              week has one, and the patient should not be startled by it. */}
          {report.riskyDays.length > 0 && (
            <span className="report-risky-marker">
              {report.riskyDays.length} {pluralDays(report.riskyDays.length)} z oznaczeniem
            </span>
          )}
        </div>
        <p className="journal-row-preview">
          Średni nastrój {mood?.value ?? '—'}
          {moodDelta ? ` (${moodDelta})` : ''} · trudniejsze dni {hardDays?.value ?? '—'}
        </p>
        <div className="journal-row-chips">
          <span className="journal-row-chip">
            {report.entryCount} z {DAYS_IN_WEEK} dni z wpisem
          </span>
          {/* The two strongest, and labelled with the intensity that put them
              there. They used to read "Lęk 6 dni", which was the right number
              while the ranking was by frequency and a stale one the moment it
              stopped being — the row would have named the strongest emotion and
              then explained it with a day count. */}
          {report.emotions.slice(0, 2).map((emotion) => (
            <span key={emotion.emotion} className="journal-row-chip">
              {emotion.emotion} {formatNumber(emotion.avgIntensity, 1)}/{LEVEL_SCALE_MAX}
            </span>
          ))}
        </div>
      </div>
      <span className="journal-row-arrow" aria-hidden="true">
        →
      </span>
    </button>
  )
}

function Reports() {
  const navigate = useNavigate()
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by the retry button; the effect below lists it as a dependency, so
  // trying again re-runs the one load rather than a second copy of it.
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const pages = usePagination(reports)

  useEffect(() => {
    let cancelled = false

    fetchWeeklyReports()
      .then((loaded) => {
        if (cancelled) return
        setReports(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Raporty</h1>
        </div>
        <HeaderMenu />
      </header>

      <p className="reports-intro">
        Raporty powstają automatycznie co tydzień na podstawie Twoich dzienniczków. Nie musisz o nich
        pamiętać ani niczego uzupełniać — nowy raport pojawia się tu po zakończeniu tygodnia.
      </p>

      {/* TODO: the visibility model below was confirmed by the client at the last
          meeting and is NOT a patient setting — reports are invisible to everyone
          except the specialists treating this patient, and a link is dropped by
          the specialist, never by the patient. The clinical reason: with eating
          disorders the tendency to hide information rises, so a patient-side
          switch would disable the feature exactly in the cases it exists for.
          This was contested earlier in the project — please do not "fix" it back
          into an opt-in share step without reading that decision first. */}
      <section className="reports-visibility-note">
        <span className="reports-visibility-icon" aria-hidden="true">
          ⓘ
        </span>
        <p>Twoje raporty są widoczne dla specjalistów prowadzących Twoją terapię.</p>
      </section>

      {loading && (
        <div className="journals-status" role="status" aria-busy="true">
          Wczytywanie raportów…
        </div>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && (
        <div className="journals-list">
          {reports.length === 0 && (
            <p className="journals-empty">
              Nie ma jeszcze żadnego raportu. Pierwszy powstanie po zakończeniu tygodnia, w którym
              zapiszesz swój dzienniczek.
            </p>
          )}
          {pages.items.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onOpen={() => navigate(reportDetailPath(report.id))}
            />
          ))}
        </div>
      )}

      {!loading && !loadError && (
        <Pagination
          page={pages.page}
          pageCount={pages.pageCount}
          from={pages.from}
          to={pages.to}
          total={pages.total}
          onChange={pages.goTo}
          unit="raportów"
        />
      )}
    </div>
  )
}

export default Reports
