import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import { fetchDietReports } from '../api/dietReports'
import { addDays, fromIsoDate, toIsoDate } from '../utils/days'
import { dayMonthLabel, weekRangeLabel } from '../utils/dietReports'
import { pluralMeals } from '../utils/meals'
import { pluralDays } from '../utils/reports'
import { usePagination } from '../hooks/usePagination'
import type { DietReport, DietReportSummary, InProgressWeek } from '../types/dietReport'
import { ROUTES, dietReportDetailPath } from '../routes'
import './dietReports.css'

/**
 * "Raporty" — the diet module's report history, §10 of `Makiety modułu
 * dietetycznego` (artboard `screen: 'reports'` in the shared prototype).
 *
 * FOUR RULES §10 STATES, none of them a default this screen is free to pick:
 *
 *   1. **A week is counted from the patient's first entry, not from Monday.**
 *      "Raport generuje się automatycznie co siedem dni, licząc od dnia
 *      pierwszego wpisu pacjentki, a nie od poniedziałku." So the weeks are
 *      `[anchor + 7k, anchor + 7k + 6]` — a *different* calendar from the
 *      psychotherapy module's Monday-Sunday weeks (`core/reports.py`), which
 *      this screen must not be "fixed" to. It is said out loud in the lead line
 *      above everything, because a patient who has met the other module's
 *      reports would otherwise read these ranges as wrong.
 *   2. **The week in progress is visible as in progress.** It is a card, never
 *      a row and never a link: there is no report for a week that has not
 *      closed, so a tap would have nowhere to go. (The psychotherapy module
 *      leaves the current week off its list entirely; §10 asks for it here.)
 *   3. **Content is the diaries and nothing else** — "bez ocen, bez wniosków,
 *      bez kalorii". So no figure on this screen is derived from anything the
 *      app was not told, and the counts below are plain facts rather than
 *      progress: no bar, no "z 7", no target, nothing a week could fail.
 *   4. **The specialist question is left open.** §10 records it as undecided —
 *      whether a report reaches the specialist automatically or only after the
 *      patient confirms — and says the screen deliberately does not settle it:
 *      "nie ma na nim ani przycisku wyślij, ani informacji o wysyłce". So there
 *      is **no share button and no note about who can see a report**, which is
 *      exactly where this screen differs from `pages/Reports.tsx`: that one
 *      carries such a note because there the client decided it. Putting one here
 *      would answer an open question in markup.
 *
 * WHY A REPORT HAS THREE ROWS AND NOT SIX, which belongs on this screen because
 * it is what the reader will notice first: `medical_db` holds meals
 * (`diet_meal`) and servings (`hydration`) and nothing else. §05's meal-context
 * fields — emotions around eating, physical versus emotional hunger, the
 * triggering situation — have no columns, because that form is not built; sleep
 * and activity (§09) are marked "Etap 2". Four of §10's six content rows
 * therefore have no source, and the payload *names* them in `missing` rather
 * than rendering an invented value. That is the module's own standard: a
 * fabricated figure in a document a specialist reads is this project's worst
 * failure mode — the same judgement that took the home screen's technique card
 * off `/home` rather than leave it showing seed data.
 *
 * IT READS `GET /api/diet/reports/`, so it has a loading state and a real
 * failure state, and — the mistake `Journals.tsx` is careful about — a failed
 * load is never drawn as "no reports yet".
 */

/** Said above everything, because these weeks are not the weeks of the app's
 *  other report screen and the ranges would otherwise read as a fault. */
const LEAD = 'Tydzień liczymy od dnia twojego pierwszego wpisu, nie od poniedziałku.'

const LOAD_ERROR = 'Nie udało się wczytać raportów.'


/** "wpis / wpisy / wpisów" — the word only, like `pluralDays`, so a caller can
 *  put its own number in front of it. Not exported: the report *detail* screen
 *  renders values the server already worded ("31 posiłków zapisanych"), so a
 *  second caller would be a sign the row's unit had changed rather than a reuse.
 */
function pluralEntries(count: number): string {
  const last = count % 10
  const teens = count % 100
  if (count === 1) return 'wpis'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return 'wpisy'
  return 'wpisów'
}

/**
 * "Domknie się dziś o północy", as the artboard words it — or names the day when
 * it is neither today nor tomorrow.
 *
 * Compared as *local calendar days*: `closesOn` is a date rather than an
 * instant, and `new Date(iso)` would read it as UTC midnight, which is the
 * previous day west of Warsaw. `toIsoDate`/`addDays` are the app's own
 * local-midnight arithmetic (`utils/days.ts`, the frontend half of
 * `core/days.py`).
 */
function closingLabel(closesOn: string, today: Date = new Date()): string {
  if (closesOn === toIsoDate(today)) return 'Domknie się dziś o północy'
  if (closesOn === toIsoDate(addDays(today, 1))) return 'Domknie się jutro o północy'
  return `Domknie się ${dayMonthLabel(fromIsoDate(closesOn))} o północy`
}

/**
 * The week in progress.
 *
 * Not a link and not a button: there is no report for a week that has not
 * closed, and a card that looked pressable would promise one.
 *
 * The two counts are said because we hold them, and said as facts — "4 dni z
 * wpisem · 12 posiłków", never "4 z 7" and never over a bar. §08's rule for the
 * water counter ("nie ma gratulacji, serii ani komunikatu o niedoborze") is the
 * module's rule generally, and it applies with more force to a week that is
 * still running: nothing here can be read as a week falling behind.
 */
function InProgressCard({ week }: { week: InProgressWeek }) {
  return (
    <section className="diet-report-progress" aria-labelledby="diet-report-progress-range">
      <p className="diet-report-eyebrow">W TOKU</p>
      <h2 id="diet-report-progress-range" className="diet-report-progress-range">
        {weekRangeLabel(week.start, week.end)}
      </h2>
      <p className="diet-report-progress-closing">{closingLabel(week.closesOn)}</p>
      <p className="diet-report-progress-counts">
        {week.daysWithMeals} {pluralDays(week.daysWithMeals)} z wpisem ·{' '}
        {pluralMeals(week.mealCount)}
      </p>
    </section>
  )
}

/**
 * One finished week.
 *
 * A real `<Link>` rather than a div with an `onClick`, so the row is reachable
 * by keyboard, opens in a new tab on a middle click, and offers its address on a
 * long press — a list of documents behaves like one.
 *
 * The meta line says "wpisów" where our unit is meals: that is the artboard's
 * own word for this row ("7 dni · 31 wpisów") and it is kept rather than
 * corrected to "posiłków", which is what the in-progress card above says. Worth
 * one line to the client rather than a silent choice either way.
 */
function ReportRow({ report }: { report: DietReport }) {
  return (
    <li className="diet-report-item">
      <Link className="diet-report-row" to={dietReportDetailPath(report.id)}>
        <span className="diet-report-dot" aria-hidden="true" />
        <span className="diet-report-row-body">
          <span className="diet-report-row-range">
            {weekRangeLabel(report.start, report.end)}
          </span>
          <span className="diet-report-row-meta">
            {report.weekDays} {pluralDays(report.weekDays)} · {report.mealCount}{' '}
            {pluralEntries(report.mealCount)}
          </span>
        </span>
        <span className="diet-report-open">otwórz</span>
      </Link>
    </li>
  )
}

/**
 * No finished report yet — an ordinary state rather than a failure: a patient in
 * their first week has none, and one who has written nothing has nothing to
 * report on. The two are said differently, because "pierwszy raport pojawi się,
 * kiedy tydzień się domknie" is a false promise to somebody whose week has not
 * started.
 */
function EmptyHistory({ summary }: { summary: DietReportSummary }) {
  if (summary.anchor === null) {
    return (
      <section className="diet-reports-empty">
        <h2>Nie ma jeszcze czego podsumować</h2>
        <p>
          Raport powstaje z zapisanych posiłków. Pierwszy tydzień zacznie się w
          dniu, w którym zapiszesz pierwszy z nich — i od tego dnia będzie liczony
          co siedem dni.
        </p>
      </section>
    )
  }

  return (
    <section className="diet-reports-empty">
      <h2>Pierwszego raportu jeszcze nie ma</h2>
      <p>
        {summary.inProgress
          ? 'Pojawi się tutaj, kiedy bieżący tydzień się domknie. Nie musisz nic robić — raport powstaje sam.'
          : 'Pojawi się tutaj po domknięciu pierwszego tygodnia. Nie musisz nic robić — raport powstaje sam.'}
      </p>
    </section>
  )
}

function DietReports() {
  const [summary, setSummary] = useState<DietReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  /**
   * Why the screen has nothing to draw — **the server's own sentence when it
   * gave one**, and a generic fallback only when it did not.
   *
   * Every refusal a patient can actually meet here is a gate rather than a
   * fault: an account waiting on a guardian's acceptance (RODO art. 8), or one
   * whose consents are not in force. Both arrive with a message saying what to
   * do, and replacing it with "nie udało się wczytać raportów" would describe a
   * failure that did not happen. Same wording rule as `Journals.tsx`.
   */
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Spróbuj ponownie", which is how the effect below is re-run —
   *  the same shape the other list screens in this module use. */
  const [attempt, setAttempt] = useState(0)
  const pages = usePagination(summary?.reports ?? [])

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body.
  useEffect(() => {
    let cancelled = false

    fetchDietReports()
      .then((loaded) => {
        if (cancelled) return
        setSummary(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
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

  return (
    <div className="diet-reports-page">
      <header className="diet-reports-header">
        <div>
          <p className="diet-reports-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Raporty</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="diet-reports-back" to={ROUTES.diet}>
        ← Wróć do strony głównej
      </Link>

      <p className="diet-reports-lead">{LEAD}</p>

      {loading && (
        <p className="diet-reports-status" role="status" aria-busy="true">
          Wczytywanie raportów…
        </p>
      )}

      {/* A failure is said as one. Rendering the empty state here would tell a
          patient there is nothing to report on when the list is only
          unreachable. */}
      {!loading && loadError && (
        <LoadError
          className="diet-reports-status diet-reports-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && summary && (
        <>
          {summary.inProgress && <InProgressCard week={summary.inProgress} />}

          {summary.reports.length === 0 ? (
            <EmptyHistory summary={summary} />
          ) : (
            <>
              <h2 className="diet-reports-heading">GOTOWE RAPORTY</h2>
              <ul className="diet-reports-list">
                {pages.items.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </ul>
              <Pagination
                page={pages.page}
                pageCount={pages.pageCount}
                from={pages.from}
                to={pages.to}
                total={pages.total}
                onChange={pages.goTo}
                unit="raportów"
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

export default DietReports
