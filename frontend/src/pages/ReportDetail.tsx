import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import ReportSections from '../components/ReportSections'
import { ApiError } from '../api/client'
import {
  fetchReportPdf,
  fetchWeeklyReport,
  reportPdfFileName,
  saveBlob,
} from '../api/reports'
import { DAYS_IN_WEEK } from '../utils/reports'
import type { WeeklyReport } from '../types/report'
import { ROUTES, journalDetailPath } from '../routes'
import './diaryEntry.css'
import './journals.css'
import './reports.css'
import './reportDetail.css'

/**
 * One weekly report.
 *
 * Structurally read-only, like the archival diary entry it is built from: a
 * report is a summary of a week that has ended, so there is nothing on this
 * screen to edit and no range to pick. What the client asked for is a dated
 * recap — what happened, how it went, what was used — closer to a spreadsheet
 * export than to an essay.
 *
 * Two things the mockup shows are deliberately absent; see the TODOs below.
 */

const LOAD_ERROR = 'Nie udało się wczytać tego raportu. Spróbuj ponownie.'

const PDF_ERROR = 'Nie udało się pobrać raportu. Spróbuj ponownie.'

function ReportDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by the retry button; the effect below lists it as a dependency, so
  // trying again re-runs the one load rather than a second copy of it.
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // One report by its week id. A 404 is "no such report" rather than an error —
  // an id naming a week with no entries and a wrong id are worded the same,
  // since neither tells the patient anything they can act on.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetchWeeklyReport(id)
      .then((loaded) => {
        if (cancelled) return
        setReport(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setReport(null)
        setLoadError(
          cause instanceof ApiError && cause.status === 404
            ? null
            : (cause instanceof ApiError && cause.formMessage) || LOAD_ERROR,
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, attempt])

  /**
   * The file comes from the server, fetched rather than linked to: the request
   * has to carry the session cookie, and a refusal has to land on this screen
   * instead of rendering as raw JSON in a new tab.
   */
  async function downloadPdf(current: WeeklyReport) {
    setDownloading(true)
    setPdfError(null)
    try {
      saveBlob(await fetchReportPdf(current.id), reportPdfFileName(current))
    } catch (cause: unknown) {
      setPdfError((cause instanceof ApiError && cause.formMessage) || PDF_ERROR)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="report-detail-page">
        <p className="journal-detail-status" role="status" aria-busy="true">
          Wczytywanie raportu…
        </p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="report-detail-page">
        <LoadError
          className="journal-detail-status journal-detail-status-error"
          message={loadError}
          onRetry={retry}
        />
        <Link to={ROUTES.reports}>← Wróć do Raportów</Link>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="report-detail-page">
        <p className="journal-detail-not-found">Nie znaleziono takiego raportu.</p>
        <Link to={ROUTES.reports}>← Wróć do Raportów</Link>
      </div>
    )
  }

  return (
    <div className="report-detail-page">
      <header className="journal-detail-header">
        <button
          type="button"
          className="journal-detail-back"
          aria-label="Wróć do Raportów"
          onClick={() => navigate(ROUTES.reports)}
        >
          ←
        </button>
        <div className="journal-detail-header-titles">
          <p className="journal-detail-module-label">PSYCHOTERAPIA</p>
          <h1>Raport</h1>
          <p className="journal-detail-date">{report.rangeLabel}</p>
        </div>
        <HeaderMenu />
      </header>

      {/* One action, centred. "Pobierz PDF" is the only one: it saves a file to
          the patient's own device, which is not an act of sharing.

          TODO: no "Wyślij terapeucie" button here, and that is deliberate —
          sharing is not a patient decision (see the visibility note on the list
          screen).

          There used to be a "Pełna analiza" link beside it, to /analysis. It was
          removed on request; the analysis is reachable from the header menu,
          which is where every other screen is reached from. */}
      <section className="report-hero">
        <p className="report-hero-label">RAPORT TYGODNIOWY</p>
        <h2 className="report-hero-range">{report.rangeLabel}</h2>
        <p className="report-hero-meta">
          {report.entryCount} z {DAYS_IN_WEEK} dni z wpisem
        </p>
        <div className="report-hero-actions">
          <button
            type="button"
            className="report-hero-button"
            onClick={() => void downloadPdf(report)}
            disabled={downloading}
          >
            {downloading ? 'Przygotowywanie…' : 'Pobierz PDF'}
          </button>
        </div>
      </section>

      {/* TODO: the "PDF na maila" fallback delivery is still missing — there is
          no mail out of this deployment at all. Saving the file is the whole of
          the export for now. */}
      {pdfError && (
        <p className="report-pdf-status report-pdf-status-error" role="alert">
          {pdfError}
        </p>
      )}

      {/* The body of the report — metrics, rankings, flagged days, summary —
          comes from components/ReportSections.tsx, which the specialist's view of
          the same week renders too. One definition, so the two readers are never
          holding different papers. The flagged days link into the diary here,
          which is the one thing the specialist's copy does not do. */}
      <ReportSections report={report} riskyDayPath={journalDetailPath} />

      <section className="journal-detail-info-banner">
        <span className="journal-detail-info-icon" aria-hidden="true">
          ⓘ
        </span>
        <p>
          Raport podsumowuje tylko to, co zapisałeś/zapisałaś w dzienniczkach w tym tygodniu. Dni bez
          wpisu nie są liczone jako złe dni — po prostu ich tu nie ma.
        </p>
      </section>
    </div>
  )
}

export default ReportDetail
