import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import { fetchCaseload, fetchPatientReports } from '../api/specialist'
import { patientLabel } from '../utils/specialist'
import { usePagination } from '../hooks/usePagination'
import { DAYS_IN_WEEK, LEVEL_SCALE_MAX, formatDelta, formatNumber, pluralDays } from '../utils/reports'
import type { ReportMetric, WeeklyReport } from '../types/report'
import { ROUTES, specialistPatientReportPath } from '../routes'
import './journals.css'
import './reports.css'
import './specialist.css'

/**
 * One patient's weekly reports, read by their specialist.
 *
 * The same documents the patient sees on their own /reports — same endpoint
 * shape, same aggregation (core/reports.py), same rows — because the point of a
 * report is that the two people in the consulting room are reading one paper.
 * The only differences are the frame: whose reports these are, and that this
 * screen has a way back to the caseload.
 *
 * A patient who is not this specialist's answers 404, exactly like a patient who
 * does not exist — a 403 would confirm the account is real, which is what the
 * invitation form takes care not to do.
 *
 * The patient's name is fetched from the caseload rather than passed in
 * navigation state, so the heading is right on a reloaded page and on a link
 * pasted into a colleague's chat — where `state` is gone and only the id
 * survives.
 */

const LOAD_ERROR = 'Nie udało się wczytać raportów pacjenta. Spróbuj ponownie.'
const NOT_MINE = 'Ten pacjent nie jest przypisany do Twojego konta.'

/** One of the four cards by key — the row previews two of them. */
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
          {/* Present, never loud — the same restraint as on the patient's own
              list. A specialist needs to see at a glance which week has one. */}
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

function SpecialistPatientReports() {
  const navigate = useNavigate()
  const { patientId } = useParams<{ patientId: string }>()

  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const pages = usePagination(reports)

  useEffect(() => {
    if (!patientId) return
    let cancelled = false

    fetchPatientReports(patientId)
      .then((loaded) => {
        if (cancelled) return
        setReports(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError(
          cause instanceof ApiError && cause.status === 404
            ? NOT_MINE
            : (cause instanceof ApiError && cause.formMessage) || LOAD_ERROR,
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [patientId, attempt])

  // The heading, from the list this screen was reached from. A failure here is
  // silent on purpose: not knowing the name is no reason to withhold the
  // reports, and the id is not a name worth printing.
  useEffect(() => {
    if (!patientId) return
    let cancelled = false

    fetchCaseload()
      .then(({ patients }) => {
        const patient = patients.find((entry) => entry.id === patientId)
        if (!cancelled && patient) setName(patientLabel(patient))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [patientId])

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Raporty pacjenta</h1>
          {name && <p className="journals-subtitle">{name}</p>}
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistHome}>
        ← Wróć do panelu
      </Link>

      <p className="reports-intro">
        Raporty powstają automatycznie co tydzień z dzienniczków pacjenta. Nie
        możesz ich edytować ani wygenerować wcześniej — nowy pojawia się tu po
        zakończeniu tygodnia.
      </p>

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
              Ten pacjent nie ma jeszcze żadnego raportu. Pierwszy powstanie po
              zakończeniu tygodnia, w którym zapisze wpisy.
            </p>
          )}
          {pages.items.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onOpen={() =>
                navigate(specialistPatientReportPath(patientId ?? '', report.id))
              }
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

export default SpecialistPatientReports
