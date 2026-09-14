import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { usePagination } from '../hooks/usePagination'
import { ApiError } from '../api/client'
import { fetchDietReports } from '../api/diet'
import { dietWeekStartWeekday } from '../utils/dietWeeks'
import { pluralDays } from '../utils/reports'
import type { DietWeeklyReport } from '../types/dietReport'
import { ROUTES, dietReportDetailPath } from '../routes'
import './dietReports.css'

/**
 * "Raporty" — §10 of the diet mockups, the history half.
 *
 * WHAT A WEEK IS HERE, because it is the one thing about this screen somebody
 * will assume they already know: seven days counted from the patient's first
 * entry, not Monday to Sunday. Both of the client's mockup sets put that
 * sentence on the artboard, and she said it in the meeting. The psychotherapy
 * module counts Mondays and keeps doing so — the arithmetic lives in
 * `utils/dietWeeks.ts`, which says at length why the two disagree and why
 * neither is being "unified" into the other.
 *
 * THREE THINGS FROM THE MOCKUP ARE DELIBERATELY NOT HERE.
 *
 * **The week in progress.** Both artboards open the list with a card labelled
 * "W TOKU" / "TRWA". A report describes a week that has ended, which is what
 * the psychotherapy module already means by the word, and the client asked for
 * reports rather than for a live view of the running week. Two modules
 * disagreeing about whether a report can describe an unfinished week is a
 * difference a patient crossing between them reads as a fault. See
 * `completedDietWeeks`.
 *
 * **"6 z 7 dni".** The row says "5 dni z wpisem" — a plain count. A fraction of
 * seven is a regularity score, and this module does not score; CLAUDE.md rules
 * out fractions, percentages and progress bars for it by name, and this list is
 * exactly where one would arrive looking like an improvement.
 *
 * **A note about who else reads this.** The psychotherapy list carries one
 * ("Twoje raporty są widoczne dla specjalistów prowadzących Twoją terapię"),
 * and it is true there. Repeating it here would be a false statement:
 * TODO(backend) there is no specialist endpoint for the diet module at all, and
 * `patient.id_specjalist` is a single FK, so a patient seeing both a
 * psychotherapist and a psychodietitian cannot even be expressed. It goes in
 * when both of those change, worded from whatever is then true.
 *
 * TODO(klientka): the ochre artboard also draws an "Udostępnij" button beside
 * "Pobierz PDF". It is not here, and not by oversight: the client's confirmed
 * rule is that sharing is not the patient's decision — a specialist is attached
 * by invitation and detached by the specialist — and `pages/Reports.tsx`
 * carries a TODO asking that this not be turned back into an opt-in. The
 * artboard's own note recommends the opposite ("rekomendujemy potwierdzenie"),
 * so the two need reconciling with her before either button exists.
 */

const INTRO_LEAD = 'Raport powstaje co siedem dni.'

const LOAD_ERROR = 'Nie udało się wczytać raportów.'

function ReportRow({ report }: { report: DietWeeklyReport }) {
  return (
    <li className="diet-reports-row">
      <Link className="diet-reports-link" to={dietReportDetailPath(report.id)}>
        <span className="diet-reports-range">{report.rangeLabel}</span>
        {/* A count, never "z 7" — see the note at the top of this file. */}
        <span className="diet-reports-days">
          {report.daysWithEntry} {pluralDays(report.daysWithEntry)} z wpisem
        </span>
        <span className="diet-reports-open" aria-hidden="true">
          Otwórz
        </span>
      </Link>
    </li>
  )
}

function DietReports() {
  /**
   * The reports come from the server now, and so does the week boundary.
   *
   * This screen used to derive them in the browser from a live calendar day,
   * so that a list left open across midnight gained its row without a reload.
   * That is gone with the derivation: "has this week ended" is decided in
   * `settings.TIME_ZONE` (`core/diet_reports.py`), which is the same clock that
   * decides which day every entry belongs to — and which is exactly what
   * deriving on the client got wrong for readers west of Warsaw. A list open
   * across midnight now gains its row on the next load, which is the same
   * behaviour the psychotherapy "Raporty" screen has.
   */
  const [reports, setReports] = useState<DietWeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Spróbuj ponownie", which is how the effect below is re-run. */
  const [attempt, setAttempt] = useState(0)
  const pages = usePagination(reports)

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body.
  useEffect(() => {
    let cancelled = false

    fetchDietReports()
      .then((loaded) => {
        if (cancelled) return
        setReports(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(
            (cause instanceof ApiError && cause.formMessage) || LOAD_ERROR,
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  function retry() {
    setLoading(true)
    setLoadError(null)
    setAttempt((n) => n + 1)
  }

  /* Every week starts on the same weekday, so the first report answers for all
     of them. With no reports there is nothing to name yet, and the empty state
     says what happens next instead. */
  const startWeekday = reports.length > 0 ? dietWeekStartWeekday(reports[0].weekStart) : null

  return (
    <div className="diet-reports-page">
      <header className="diet-reports-header">
        <Link
          className="diet-reports-back"
          to={ROUTES.diet}
          aria-label="Wróć do strony głównej modułu dietetycznego"
        >
          ←
        </Link>
        <div className="diet-reports-header-titles">
          <p className="diet-reports-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Raporty</h1>
        </div>
        <HeaderMenu />
      </header>

      {/* The weekday is said out loud because it is the screen's one surprising
          rule, and because a patient who counted on Mondays would otherwise
          read the ranges as wrong. */}
      <p className="diet-reports-intro">
        {startWeekday
          ? `${INTRO_LEAD} Twój tydzień zaczyna się ${startWeekday} — w dniu pierwszego wpisu, nie w poniedziałek.`
          : `${INTRO_LEAD} Tydzień liczy się od dnia Twojego pierwszego wpisu, nie od poniedziałku.`}
      </p>

      {loading && <p className="diet-reports-empty">Wczytywanie raportów…</p>}

      {/* **A FAILED LOAD IS NEVER DRAWN AS AN EMPTY LIST.** "Pierwszy raport
          pojawi się…" about a diary that has several is the mistake
          `Journals.tsx` is careful about, and the server's own sentence is
          preferred to ours: every refusal a patient can actually reach here is
          a gate (an unlinked minor, withdrawn consents) and arrives with a
          message saying what to do about it. */}
      {!loading && loadError && (
        <LoadError
          className="diet-reports-empty diet-reports-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && reports.length === 0 && (
        /* One sentence and nothing to press. An empty list here is not a state
           to escape from — it is a diary younger than a week, and offering a
           button would suggest a report is something to go and make. */
        <p className="diet-reports-empty">
          Pierwszy raport pojawi się siedem dni po Twoim pierwszym wpisie.
        </p>
      )}

      {!loading && !loadError && reports.length > 0 && (
        <ul className="diet-reports-list">
          {pages.items.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </ul>
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

export default DietReports
