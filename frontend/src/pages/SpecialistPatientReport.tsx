import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import ReportSections from '../components/ReportSections'
import { ApiError } from '../api/client'
import { fetchPatientReport, fetchPatientReportPdf } from '../api/specialist'
import { reportPdfFileName, saveBlob } from '../api/reports'
import { DAYS_IN_WEEK } from '../utils/reports'
import type { WeeklyReport } from '../types/report'
import { specialistPatientReportsPath } from '../routes'
import './diaryEntry.css'
import './journals.css'
import './reports.css'
import './reportDetail.css'
import './specialist.css'

/**
 * One weekly report, read by the patient's specialist.
 *
 * THE SAME DOCUMENT THE PATIENT SEES. The body comes from
 * components/ReportSections.tsx, which pages/ReportDetail.tsx renders too — one
 * definition, so a specialist and a patient discussing "the report" are never
 * holding two different papers. What differs is the frame: the way back leads to
 * this patient's list rather than to /reports, and the note at the bottom is
 * written for a reader who did not write the entries.
 *
 * ONE DELIBERATE DIFFERENCE IN THE BODY: the flagged days are not links here.
 * The specialist's access is the weekly reports and nothing else for now, so a
 * link into the diary entry behind a flagged day would answer a question that is
 * still open with the client — see the note on `riskyDayPath`.
 *
 * The PDF carries the *patient's* address, not the reader's: a printout that
 * leaves the app has to say whose week it is (core/views.py `ReportPdfBase`).
 */

const LOAD_ERROR = 'Nie udało się wczytać raportu. Spróbuj ponownie.'
const NOT_FOUND = 'Nie znaleziono raportu dla tego tygodnia u tego pacjenta.'
const PDF_ERROR = 'Nie udało się pobrać raportu. Spróbuj ponownie.'

function SpecialistPatientReport() {
  const navigate = useNavigate()
  const { patientId, reportId } = useParams<{ patientId: string; reportId: string }>()
  const backTo = specialistPatientReportsPath(patientId ?? '')

  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId || !reportId) return
    let cancelled = false

    fetchPatientReport(patientId, reportId)
      .then((loaded) => {
        if (cancelled) return
        setReport(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setReport(null)
        // A week with no entries, a week that does not exist and a patient who
        // is not this specialist's all answer 404 — and the wording covers all
        // three, because none of them is something to act on differently.
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
  }, [patientId, reportId, attempt])

  async function downloadPdf(current: WeeklyReport) {
    if (!patientId) return
    setDownloading(true)
    setPdfError(null)
    try {
      saveBlob(await fetchPatientReportPdf(patientId, current.id), reportPdfFileName(current))
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
        <Link to={backTo}>← Wróć do raportów pacjenta</Link>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="report-detail-page">
        <p className="journal-detail-not-found">{NOT_FOUND}</p>
        <Link to={backTo}>← Wróć do raportów pacjenta</Link>
      </div>
    )
  }

  return (
    <div className="report-detail-page">
      <header className="journal-detail-header">
        <button
          type="button"
          className="journal-detail-back"
          aria-label="Wróć do raportów pacjenta"
          onClick={() => navigate(backTo)}
        >
          ←
        </button>
        <div className="journal-detail-header-titles">
          <p className="journal-detail-module-label">PSYCHOTERAPIA</p>
          <h1>Raport pacjenta</h1>
          <p className="journal-detail-date">{report.rangeLabel}</p>
        </div>
        <HeaderMenu />
      </header>

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

      {pdfError && (
        <p className="report-pdf-status report-pdf-status-error" role="alert">
          {pdfError}
        </p>
      )}

      {/* No `riskyDayPath`: the flagged days render as text rather than as links
          into the patient's diary — see the header of this file. */}
      <ReportSections report={report} />

      <section className="journal-detail-info-banner">
        <span className="journal-detail-info-icon" aria-hidden="true">
          ⓘ
        </span>
        <p>
          Raport podsumowuje tylko to, co pacjent zapisał w dzienniczkach w tym
          tygodniu. Dni bez wpisu nie są liczone jako złe dni — po prostu ich tu
          nie ma.
        </p>
      </section>
    </div>
  )
}

export default SpecialistPatientReport
