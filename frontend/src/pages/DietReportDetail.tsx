import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import { fetchDietReport } from '../api/dietReports'
import { weekRangeLabel } from '../utils/dietReports'
import { fromIsoDate } from '../utils/days'
import type { DietReport } from '../types/dietReport'
import { ROUTES } from '../routes'
import './dietReportDetail.css'

/**
 * One weekly diet report — §10 of `Makiety modułu dietetycznego`, artboard
 * `screen: 'report'`.
 *
 * WHAT §10 SAYS THIS IS: "zestawienie, nie interpretacja". "Zawartość: tylko
 * dane z dzienniczków." "Bez ocen, bez wniosków, bez kalorii." So every line on
 * this screen is a label and a value the server composed out of rows the patient
 * wrote, and there is nothing here that scores, ranks or congratulates.
 *
 * THE WEEKS ARE NOT MONDAY-SUNDAY, and that is the client's decision rather than
 * an oversight: "Raport generuje się automatycznie co siedem dni, licząc od dnia
 * pierwszego wpisu pacjentki, a nie od poniedziałku." The psychotherapy module's
 * reports (`core/reports.py`) *are* Monday-Sunday; these are `[anchor + 7k,
 * anchor + 7k + 6]`. Nothing on this screen computes either — the range comes
 * from the payload — but do not "fix" one module to match the other.
 *
 * THE OPEN QUESTION §10 RECORDS, and which this screen deliberately does not
 * answer: whether a report reaches the specialist automatically or only after the
 * patient confirms it. "Ekran celowo tego nie przesądza — nie ma na nim ani
 * przycisku wyślij, ani informacji o wysyłce." So there is **no share button and
 * no note about who can see this**. That differs from `pages/Reports.tsx` in the
 * psychotherapy module, which carries exactly such a note — there the client has
 * decided (the reports go to the treating specialist and the patient cannot cut
 * that off). Adding either the button or the note here would answer an open
 * question in markup, and a client reading the screen would reasonably take it
 * as settled.
 *
 * WHY THERE ARE THREE ROWS AND NOT SIX. §10 lists six content sections; four of
 * them have no column anywhere in medical_db. `diet_meal` holds the day, the
 * kind, the hour and the description; `hydration` holds a serving. §05's
 * meal-context fields — the emotions at a meal, physical against emotional
 * hunger, the situation — are a form that is not built, and sleep and activity
 * are §09, marked "Etap 2". So the server names those sections in `missing`
 * instead of rendering them with an invented figure, and the scope note below
 * says so in one line. A fabricated number in a document a specialist reads is
 * this project's worst failure mode: the home screen's technique suggestion was
 * taken off the screen rather than left showing seed data.
 *
 * "POBIERZ PDF" IS NOT HERE, and it is the one part of §10 that is not
 * implemented. The psychotherapy module's export is a whole ReportLab document
 * (`core/report_pdf.py`, with Liberation Sans committed to the repo because the
 * slim image ships no font that has `ą ę ń ś ź ż`), and a diet report needs its
 * own story: different sections, different sentences. `ReportPdfBase` in
 * `core/views.py` is the reusable half — content negotiation, the attachment
 * header, `Cache-Control: no-store` and the per-account throttle. A button that
 * downloaded nothing would be worse than no button, for the same reason the
 * technique card went.
 *
 * TODO: the PDF export. It needs (1) a `build_story` for this payload in a new
 * `core/diet_report_pdf.py`, (2) a view on `ReportPdfBase` at
 * `/api/diet/reports/<id>/pdf/`, and (3) the button plus `saveBlob` here, the
 * way `pages/ReportDetail.tsx` does it.
 */

const LOAD_ERROR = 'Nie udało się wczytać raportu.'

/**
 * Worded so it does not imply the report exists. The backend answers 404 both
 * for an id naming a week nobody has entries for and for another patient's
 * report, and it does not tell the two apart — so neither does this sentence.
 * The same care `pages/JournalDetail.tsx` takes.
 */
const NOT_FOUND = 'Nie znaleziono raportu dla tego tygodnia.'

/**
 * The closing line, from the artboard: "Raport zawiera wyłącznie to, co sama
 * zapisałaś."
 *
 * Reworded to address either gender, the way the rest of the app does
 * ("zapisałaś lub zapisałeś", as on the hydration and journals screens). The
 * artboard's copy is feminine because the client's persona is a woman; the app
 * has male patients too and a screen that assumes otherwise reads as written for
 * somebody else.
 */
const CLOSING_NOTE = 'Raport zawiera wyłącznie to, co zapisałaś lub zapisałeś.'

/**
 * The changes card's title.
 *
 * DELIBERATE DEVIATION: the artboard titles this "Zmiany od ostatniej wizyty".
 * This app holds no visit dates of any kind — there is no appointment table, no
 * column on `patient`, nothing — so that title would claim knowledge the app
 * does not have. What the server actually computes is the change from the
 * previous seven-day week, and the title says that.
 *
 * TODO(klientka): confirm the wording, or tell us where a visit date would come
 * from. If visits ever exist, "od ostatniej wizyty" is a better reading for a
 * conversation in the consulting room and the backend would compute it instead.
 */
const CHANGE_HEADING = 'Zmiany od poprzedniego tygodnia'

/**
 * What the changes card says when there is no earlier week.
 *
 * The card renders either way. An absent card would make its own absence a
 * signal — the reader would have to know that a missing section means "first
 * week" rather than "nothing changed" — and "there is no week to compare with"
 * is itself a reading. The psychotherapy report makes the same argument for its
 * risky-behaviour section, which is rendered on a week that held none.
 */
const NO_CHANGE_NOTE =
  'To pierwszy tydzień z wpisami — nie ma jeszcze wcześniejszego tygodnia, ' +
  'z którym można go porównać.'

/** "8 sierpnia". Lowercase month, which is how Polish spells one; see the note
 *  in dietReportDetail.css about `text-transform`. */
function dayLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
  })
}

/** "a, b i c" — the Polish list, with "i" before the last item rather than a
 *  comma. Used only for the scope note's two lists. */
function joinList(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} i ${items[items.length - 1]}`
}

/**
 * THE SCOPE NOTE — the most important sentence on this screen, and the one thing
 * on it that is not on the artboard.
 *
 * A three-row report with no explanation reads as a patient who wrote almost
 * nothing, and this document is meant to be opened in front of a specialist. So
 * the screen says which sections the diary can answer today and which are
 * waiting on a form that does not exist yet.
 *
 * Composed **from the payload** rather than typed out: `rows` and `missing` are
 * the server's own answer to "what is in this report", so the sentence cannot
 * drift from what is rendered above it the way a hand-written list would the
 * first time a section is added. It promises no date — the diary starting to ask
 * these questions is a decision, not a schedule.
 */
function scopeNote(report: DietReport): string {
  const covered = joinList(
    report.rows.map((row) => row.label.toLocaleLowerCase('pl-PL')),
  )
  const opening = `Ten raport zestawia to, co dziś zapisuje dzienniczek: ${covered}.`
  if (report.missing.length === 0) return opening

  // Declined rather than written in the plural: `missing` is a list the server
  // owns, and one entry left on it would otherwise read "Pozostałe sekcje —
  // sen — pojawią się".
  const rest = joinList(report.missing)
  const tail =
    report.missing.length === 1
      ? `Pozostała sekcja — ${rest} — pojawi się tutaj, kiedy dzienniczek zacznie o nią pytać.`
      : `Pozostałe sekcje — ${rest} — pojawią się tutaj, kiedy dzienniczek zacznie o nie pytać.`
  return `${opening} ${tail}`
}

function DietReportDetail() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<DietReport | null>(null)
  // Starts false when the route gave us no id: there is nothing to wait for, so
  // deriving it here beats setting it from inside the effect.
  const [loading, setLoading] = useState(Boolean(id))
  /**
   * Why the screen has nothing to draw — the server's own sentence when it gave
   * one, and the generic fallback only when it did not. Every refusal a patient
   * can actually meet here is a gate rather than a fault (an account waiting on
   * a guardian's acceptance, one whose consents are not in force), and each
   * arrives with a message saying what to do about it. Left null for a 404,
   * which is not a failure — see NOT_FOUND.
   */
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Spróbuj ponownie", which is how the effect below is re-run. */
  const [attempt, setAttempt] = useState(0)

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetchDietReport(id)
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

  function retry() {
    setLoading(true)
    setLoadError(null)
    setAttempt((n) => n + 1)
  }

  return (
    <div className="diet-report-detail-page">
      {/* The header stays on every state, unlike the psychotherapy report's
          detail screen: a patient who met a 404 should still be able to reach
          the menu rather than only the one back link. */}
      <header className="diet-report-detail-header">
        <div>
          <p className="diet-report-detail-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Raport tygodniowy</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="diet-report-detail-back" to={ROUTES.dietReports}>
        ← Wróć do raportów
      </Link>

      {loading && (
        <p className="diet-report-detail-loading" role="status" aria-busy="true">
          Wczytywanie raportu…
        </p>
      )}

      {!loading && loadError && (
        <LoadError
          className="diet-report-detail-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && !report && (
        <p className="diet-report-detail-not-found">{NOT_FOUND}</p>
      )}

      {report && !loadError && (
        <>
          {/* The lead line from the artboard: "1 – 7 sierpnia · wygenerowany
              8 sierpnia".

              DELIBERATE COPY DEVIATION: "dostępny od", not "wygenerowany".
              Nothing generates these reports — each one is derived from the
              diary rows on every request, with no stored document and no
              scheduled job anywhere in the project — so "wygenerowany 8
              sierpnia" would name an event that never happened. "dostępny od" is
              the true statement about `availableFrom`, which is simply the day
              after the week ended.

              TODO(klientka): the artboard says "wygenerowany". If the reports are
              ever stored (which is what `raport` in medical_db is waiting for,
              plus the week column it still lacks), that word becomes true and
              this line should go back to it.

              The range wording comes from the list screen's own
              `weekRangeLabel`, so the two screens cannot start writing a week
              differently. */}
          <p className="diet-report-detail-lead">
            {weekRangeLabel(report.start, report.end)} · dostępny od{' '}
            {dayLabel(report.availableFrom)}
          </p>

          <p className="diet-report-detail-scope">{scopeNote(report)}</p>

          {/* ONE card holding the label/value rows, in the order the server sent
              them. Both the label and the sentence come from the payload and
              nothing here recomposes either: the same sentences have to reach a
              PDF later (see the header), and Polish composed in two places is
              Polish free to drift — a figure worded one way on screen and
              another on the printout is exactly the disagreement
              `components/ReportSections.tsx` was extracted to prevent.

              Which is also why the week's own figures are not repeated above
              this card: "6 z 7 dni · 31 posiłków zapisanych" is already the
              regularity row, and a hero tile saying it again would be a second
              place free to say it differently. */}
          <section className="diet-report-detail-card">
            {/* No heading on the artboard, so this one is for the document
                outline only — a card of rows with no name is hard to navigate
                with a screen reader, and adding visible chrome the designer did
                not draw is the wrong fix. */}
            <h2 className="visually-hidden">Zestawienie z dzienniczka</h2>
            <dl className="diet-report-detail-rows">
              {report.rows.map((row) => (
                <div className="diet-report-detail-row" key={row.key}>
                  <dt className="diet-report-detail-label">{row.label}</dt>
                  <dd className="diet-report-detail-value">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            className="diet-report-detail-card diet-report-detail-change-card"
            aria-labelledby="diet-report-change-heading"
          >
            <h2 id="diet-report-change-heading">{CHANGE_HEADING}</h2>
            <p className="diet-report-detail-change">
              {report.changeNote ?? NO_CHANGE_NOTE}
            </p>
          </section>

          <p className="diet-report-detail-closing">{CLOSING_NOTE}</p>
        </>
      )}
    </div>
  )
}

export default DietReportDetail
