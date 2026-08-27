import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import ReportChangeChips from '../components/ReportChangeChips'
import ReportMetricCard from '../components/ReportMetricCard'
import ReportRankingBars, { type RankingRow } from '../components/ReportRankingBars'
import { ApiError } from '../api/client'
import { fetchJournalEntries } from '../api/diary'
import { fromIsoDate } from '../utils/days'
import { EMOTION_COLORS } from '../utils/emotions'
import { DAYS_IN_WEEK, buildWeeklyReports, findWeeklyReport, pluralDays } from '../utils/reports'
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

/** Triggers have no palette of their own, so they share one sage tone rather
 *  than borrowing colours that mean an emotion elsewhere in the app. */
const TRIGGER_BAR_COLOR = 'var(--color-sage-light)'

/** Mock, until a real PDF is generated somewhere: the mockup's six-page export. */
const MOCK_PDF_PAGE_COUNT = 6

function pdfFileName(report: WeeklyReport): string {
  return `raport-tygodniowy-${report.weekStart}.pdf`
}

function emotionRows(report: WeeklyReport): RankingRow[] {
  return report.emotions.map((entry) => ({
    label: entry.emotion,
    count: entry.days,
    // The one palette, shared with the diary and the home chart.
    color: EMOTION_COLORS[entry.emotion],
  }))
}

function triggerRows(report: WeeklyReport): RankingRow[] {
  return report.triggers.map((entry) => ({
    label: entry.trigger,
    count: entry.days,
    color: TRIGGER_BAR_COLOR,
  }))
}

/** 'Środa, 19 sierpnia' — enough to find the day in the diary.
 *
 * The first letter is raised here rather than with `text-transform: capitalize`,
 * which would raise the month's too: Polish month names are lower case. */
function riskyDayLabel(date: string): string {
  const label = fromIsoDate(date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function ReportDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const today = useMemo(() => new Date(), [])

  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<string | null>(null)
  /** The mock export: pressing the button only shows that the file is ready. */
  const [pdfReady, setPdfReady] = useState(false)

  // Reports are still derived from the diary on the client, so this screen loads
  // the same entries the list did and picks its week back out of them. An id
  // naming a week with no entries is simply not found — the same wording as a
  // wrong id, since neither tells the patient anything they can act on.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetchJournalEntries()
      .then((entries) => {
        if (cancelled) return
        setReport(findWeeklyReport(buildWeeklyReports(entries, today), id))
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setReport(null)
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, today])

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
        <p className="journal-detail-status journal-detail-status-error" role="alert">
          {loadError}
        </p>
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

      {/* TODO: no "Wyślij terapeucie" button here, and that is deliberate —
          sharing is not a patient decision (see the visibility note on the list
          screen). "Pobierz PDF" stays: it saves a file to the patient's own
          device, which is not an act of sharing. */}
      <section className="report-hero">
        <p className="report-hero-label">RAPORT TYGODNIOWY</p>
        <h2 className="report-hero-range">{report.rangeLabel}</h2>
        <p className="report-hero-meta">
          {report.entryCount} z {DAYS_IN_WEEK} dni z wpisem
        </p>
        <div className="report-hero-actions">
          <button type="button" className="report-hero-button" onClick={() => setPdfReady(true)}>
            Pobierz PDF
          </button>
          <Link to={ROUTES.analysis} className="report-hero-button report-hero-button-outline">
            Pełna analiza
          </Link>
        </div>
      </section>

      {/* TODO: mock. Nothing is generated or downloaded yet — this only shows the
          state the finished export lands in. The real file comes from the
          backend, together with the "PDF na maila" fallback delivery.
          The second line is not decoration: without it the patient is told a file
          is ready and goes looking through their device for one that was never
          written. It comes out with the real export. */}
      {pdfReady && (
        <p className="report-pdf-status" role="status">
          Raport gotowy: {pdfFileName(report)} · {MOCK_PDF_PAGE_COUNT} stron
          <span className="report-pdf-status-note">
            Podgląd — pobieranie pliku uruchomimy w kolejnej wersji.
          </span>
        </p>
      )}

      <section className="report-metrics">
        {report.metrics.map((metric) => (
          <ReportMetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="journal-detail-card">
        <h2>Najczęściej odczuwane emocje</h2>
        <ReportRankingBars
          rows={emotionRows(report)}
          emptyText="W tym tygodniu żadna emocja nie została oceniona."
        />
      </section>

      <section className="journal-detail-card">
        <h2>Najczęstsze wyzwalacze</h2>
        <ReportRankingBars
          rows={triggerRows(report)}
          emptyText="W tym tygodniu żaden wpis nie wskazywał miejsca ani sytuacji."
        />
      </section>

      {/* The section stays visible even when it is empty: for a specialist, "no
          flagged days this week" is itself a reading, and a section that appears
          only on bad weeks would announce them from the table of contents. */}
      <section className="journal-detail-card">
        <h2>Zachowania ryzykowne</h2>
        {report.riskyDays.length === 0 ? (
          <p className="report-empty">Brak oznaczonych zachowań ryzykownych w tym tygodniu.</p>
        ) : (
          <>
            <p className="report-risky-count">
              <span className="risky-behavior-icon" aria-hidden="true">
                !
              </span>
              Zachowanie ryzykowne oznaczone w {report.riskyDays.length} z {DAYS_IN_WEEK}{' '}
              {pluralDays(DAYS_IN_WEEK)}.
            </p>
            <div className="report-risky-list">
              {report.riskyDays.map((day) => (
                <Link key={day.entryId} to={journalDetailPath(day.entryId)} className="report-risky-row">
                  <div>
                    <span className="report-risky-date">{riskyDayLabel(day.date)}</span>
                    <p className="report-risky-note">
                      {day.notePreview || 'Dzień oznaczony bez opisu.'}
                    </p>
                  </div>
                  <span className="journal-row-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* TODO: "Skuteczność technik" from the mockup goes here. It needs a way to
          rate a technique after applying it, which the app does not have yet
          (extension-priority feature) — a percentage computed from nothing would
          be a made-up number in a document a therapist reads. */}

      {/* TODO: "Realizacja celów" from the mockup goes here, after the techniques
          section. It needs the therapeutic-goals system, which does not exist yet
          either (also an extension). */}

      <section className="journal-detail-card">
        <h2>Podsumowanie tygodnia</h2>
        <p className="report-summary-text">{report.summary}</p>
        <ReportChangeChips changes={report.changes} />
      </section>

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
