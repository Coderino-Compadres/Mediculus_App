import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import MealEmotions from '../components/MealEmotions'
import Pagination from '../components/Pagination'
import ReportRankingBars, { type RankingRow } from '../components/ReportRankingBars'
import { ApiError } from '../api/client'
import { fetchDietReport, fetchDietReportPdf } from '../api/diet'
import { saveBlob } from '../api/reports'
import { usePagination } from '../hooks/usePagination'
import { dietDayLabel, dietShortDayLabel } from '../utils/dietWeeks'
import {
  dietReportPdfFileName,
  emotionRatingNote,
  mealSlotLabel,
} from '../utils/dietReport'
import { EMOTION_COLORS } from '../utils/emotions'
import { mealsGenitive, pluralMeals } from '../utils/meals'
import { formatGlasses, pluralGlasses, weekdayLabel } from '../utils/drinks'
import { activityKindLabel, feelingAfterLabel, formatDurationMinutes } from '../utils/activity'
import {
  SLEEP_QUALITY_VALUES,
  formatSleepDuration,
  sleepDurationMinutes,
  wakeFeelingLabel,
} from '../utils/sleep'
import type { DietMeal } from '../types/diet'
import type { DietReportDay, DietWeeklyReport } from '../types/dietReport'
import { ROUTES } from '../routes'
import './reportDetail.css'
import './dietReport.css'

/**
 * One weekly report — §10's detail half.
 *
 * WHAT THE CLIENT ASKED FOR IS A LISTING, and the mockup's own words for it are
 * "etykieta i wartość, wiersz po wierszu: data, co się działo" and "bez ocen,
 * bez wniosków, bez kalorii". So the screen is three cards: which days hold an
 * entry, when the meals happened, and then the week day by day. Nothing on it
 * is an average, a total, a comparison or a grade.
 *
 * WHAT IS NOT HERE, all of it deliberate and each argued where it would go:
 *
 * WHAT A MEAL'S OWN EMOTIONS LOOK LIKE HERE: listed under the meal that felt
 * them, via `MealEmotions` — the same read-only chips `DietHome.tsx`,
 * `DietJournals.tsx` and `DietJournalDay.tsx` already draw, so a chip cannot
 * read differently on the report than it does everywhere else. That is a
 * listing ("co się działo"), not the summary below — nothing here counts how
 * often an emotion appeared.
 *
 * "NAJCZĘSTSZE EMOCJE PRZY JEDZENIU" IS THE SECOND CARD NOW, and it is the one
 * place on this screen that counts anything. It stood as a TODO here for as
 * long as the section was argued two ways at once: the mockup asks for it by
 * name (§05), and this module's rule is that nothing is summed. What settles it
 * is *what the number is about*. Every figure in that card rates a feeling the
 * patient put on a slider herself — the psychotherapy form's own picker, the
 * same ten names, the same 0-10 — so it is her answer read back, not a verdict
 * on a meal. Nothing about the food feeds it: no kind, no hour, no description.
 * A card here that started describing the eating would have crossed the line.
 *
 * TODO(§05): "Głód fizyczny wobec emocjonalnego" and "Sytuacje jedzenia
 * emocjonalnego" — the other two sections the mockup puts between the meal
 * times and the day-by-day listing. Both are still blocked on the same thing
 * the emotions card was blocked on until `diet_meal_emotion` arrived: there is
 * no column to read. §04/§05's form asks what was felt and neither of those
 * two questions, so summarising them would mean inventing an answer.
 *
 * TODO(§10): "Zmiany od ostatniej wizyty" — the card between the listing and
 * the footer on the artboard. Three things are missing at once: the one pair
 * the mockup says a report may compare is the two hungers (§05, neither
 * exists), the app does not know when a visit happened, and comparing meal or
 * entry counts week to week would be a verdict on regularity, which this module
 * does not pass.
 *
 * "Pobierz PDF" is built: the endpoint exists now (`fetchDietReportPdf`), the
 * file is rendered by the server the way the psychotherapy one is
 * (`core/report_pdf.py`, ReportLab, its own throttle) and fetched with the
 * session cookie. Both readers of this view get it — the patient here and the
 * specialist through pages/SpecialistPatientDietReport.tsx — and it is drawn
 * only when an `onDownload` is handed in, as a button rather than a link,
 * because it saves a file rather than going anywhere.
 *
 * **IT RENDERS ALL SEVEN DAYS.** "Zestawienie tygodnia" pages one
 * day at a time below, and that is a property of *this screen* rather than of
 * the document: a report is a week, and a PDF holding whichever day the reader
 * happened to be on would be a file that means something different every time
 * it is saved. The server builds the whole week already (`build_diet_reports`
 * sends all seven), so the renderer has nothing to undo — it simply must not
 * learn about `?page=`.
 *
 * TODO(klientka): no "Udostępnij" and no "Wyślij", and no note about who else
 * reads this — both are argued on pages/DietReports.tsx, where the same two
 * absences are visible on the list.
 */

const NOT_ANSWERED = 'nie wpisano'

/** One day to a page in "Zestawienie tygodnia" — see `ReportBody` for why this
 *  is not the house `PAGE_SIZE`. */
const DAYS_PER_PAGE = 1

/**
 * The emotions ranking, as the shared bars read it.
 *
 * `measure` stays at its default 'count', so the bar draws how *often* — which
 * is what §05 names this section for. The psychotherapy report's ranking, drawn
 * by the same component, measures intensity instead, because that one is named
 * for strength. Both numbers are on both rows; only the length differs, and
 * `ReportRankingBars` carries the argument.
 *
 * The colour is the app's one palette (`utils/emotions.ts`), the same one the
 * chips under each meal on this very screen use — so an emotion cannot be one
 * colour in the ranking and another twelve lines below it.
 */
function emotionRows(rows: DietWeeklyReport['emotions']['rows']): RankingRow[] {
  return rows.map((row) => ({
    label: row.emotion,
    count: row.meals,
    color: EMOTION_COLORS[row.emotion],
    average: row.avgIntensity,
    note: emotionRatingNote(row),
  }))
}

/**
 * "Najczęstsze emocje przy jedzeniu" — §05.
 *
 * Renders nothing at all for a week nobody picked a chip in. An empty ranking,
 * or a "brak emocji", would read as a question the patient failed to answer;
 * §05's rule is that no field blocks a save, so a week of meals saved without an
 * emotion is an ordinary week and the report simply has one card fewer. The
 * same rule `MealEmotions` follows for a single meal.
 */
function EmotionRanking({ emotions }: { emotions: DietWeeklyReport['emotions'] }) {
  if (emotions.rows.length === 0) return null

  const { mealsWithEmotion } = emotions

  return (
    <section className="diet-report-card" aria-labelledby="diet-report-emotions-heading">
      <h2 id="diet-report-emotions-heading">Najczęstsze emocje przy jedzeniu</h2>
      {/* The count the rows were drawn from, said before them rather than after.
          One meal may carry several chips, so the rows can add up to more than
          the meals behind them — without this line a week of three
          heavily-annotated meals reads like a week of twelve. It is a
          denominator, not a score: it exists so a number cannot be misread. */}
      <p className="diet-report-card-caption">
        Z {mealsWithEmotion} {mealsGenitive(mealsWithEmotion)}, przy których zapisałaś lub
        zapisałeś emocję.
      </p>
      <ReportRankingBars
        rows={emotionRows(emotions.rows)}
        // Unreachable — the card returns null above rather than drawing an
        // empty ranking. Passed because the prop is required, and worded as the
        // ordinary answer it would be if it ever were reached.
        emptyText="W tym tygodniu nie ma posiłku z zapisaną emocją."
        measure="average"
        countLabel={pluralMeals}
      />
      {/* What the numbers are and, just as importantly, what they are not. The
          module's whole premise is that it does not grade food, and a card of
          bars is exactly where a reader might assume otherwise. */}
      <p className="diet-report-card-note">
        Pasek pokazuje średnie natężenie emocji w skali 0–10, które oceniłaś lub oceniłeś na
        suwaku — nie ocenia jedzenia. Liczba mówi, przy ilu posiłkach pojawiła się dana emocja.
      </p>
    </section>
  )
}

/** "22:15 · Kolacja" — the meal's own head, in the mockups' own formatting.
 *  A meal that named neither is still a meal; it is described by its text. */
function MealLine({ meal }: { meal: DietMeal }) {
  const description = meal.description.trim()

  return (
    <li className="diet-report-meal">
      {/* Ochre, per §15: an hour is one of the things this module marks in the
          module's own colour. "bez godziny" takes the same slot rather than
          collapsing the row, so the meals still line up down the card. */}
      <span className="diet-report-meal-time">{meal.time ?? 'bez godziny'}</span>
      <span className="diet-report-meal-body">
        {meal.kind && <span className="diet-report-meal-kind">{meal.kind}</span>}
        <span
          className={
            description ? 'diet-report-meal-text' : 'diet-report-meal-text-empty'
          }
        >
          {description || 'bez opisu'}
        </span>
        {/* Renders nothing for a meal with no chips picked — `MealEmotions`
            already returns null for an empty list, the same rule every other
            line on this card follows for an unanswered question. */}
        <MealEmotions emotions={meal.emotions} />
      </span>
    </li>
  )
}

/** One label-and-value line inside a day. `null` prints "nie wpisano" rather
 *  than a zero or an empty space — a question nobody answered is not an answer
 *  of nought, which is the rule the whole module holds to. */
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <li className="diet-report-fact">
      <span className="diet-report-fact-label">{label}:</span>{' '}
      <span className={value === null ? 'diet-report-fact-empty' : undefined}>
        {value ?? NOT_ANSWERED}
      </span>
    </li>
  )
}

function DaySummary({ day }: { day: DietReportDay }) {
  const headingId = `diet-report-day-${day.date}`
  const night = day.sleep
  const duration = night ? sleepDurationMinutes(night.fellAsleepAt, night.wokeUpAt) : null

  /* `role="group"` rather than a `<section>`, which is a landmark: seven days
     inside three cards put ten landmarks on one screen, seven of them named
     after weekdays, and a landmark list is for crossing a page rather than for
     walking a week. The heading is what navigates here, and the day keeps its
     accessible name so it is still addressable as a unit. */
  return (
    <div className="diet-report-day" role="group" aria-labelledby={headingId}>
      <h3 id={headingId}>{dietDayLabel(day.date)}</h3>

      {day.empty ? (
        /* Said plainly and quietly. A day nobody wrote on is an ordinary day —
           the footer says so too — not a gap the screen should dramatise. */
        <p className="diet-report-day-empty">brak wpisu</p>
      ) : (
        <dl className="diet-report-day-facts">
          {day.meals.length > 0 && (
            /* Full width, unlike the three short diaries below: a meal carries
               a description somebody typed in a sentence or two, and a
               paragraph set in a 300px column is a paragraph nobody reads. */
            <div className="diet-report-group diet-report-group-wide">
              <dt>Posiłki</dt>
              <dd>
                <ul className="diet-report-meals">
                  {day.meals.map((meal) => (
                    <MealLine key={meal.id} meal={meal} />
                  ))}
                </ul>
              </dd>
            </div>
          )}

          {day.hydration && (
            <div className="diet-report-group">
              <dt>Nawodnienie</dt>
              <dd>
                {/* As the hydration screen counts it, and nothing more: no
                    goal, no share of it, no comparison with another day. The
                    figure is the server's own, formatted and not recomputed. */}
                <ul className="diet-report-facts">
                  <Fact
                    label="Płyny"
                    value={`${formatGlasses(day.hydration.glasses)} ${pluralGlasses(
                      day.hydration.glasses,
                    )}`}
                  />
                </ul>
              </dd>
            </div>
          )}

          {night && (
            <div className="diet-report-group">
              <dt>Sen</dt>
              <dd>
                <ul className="diet-report-facts">
                  <Fact label="Zaśnięcie" value={night.fellAsleepAt} />
                  <Fact label="Przebudzenie" value={night.wokeUpAt} />
                  {/* The module's one computed value, and it is reused rather
                      than repeated here: the night crosses midnight, which is
                      why it is a function at all. */}
                  <Fact
                    label="Długość"
                    value={duration === null ? null : formatSleepDuration(duration)}
                  />
                  {/* "3 w skali 1-5" rather than "3 z 5": the scale has to be
                      named for the number to mean anything, and a fraction
                      would read as a score out of five. */}
                  <Fact
                    label="Jakość snu"
                    value={
                      night.quality === null
                        ? null
                        : `${night.quality} w skali ${SLEEP_QUALITY_VALUES[0]}-${
                            SLEEP_QUALITY_VALUES[SLEEP_QUALITY_VALUES.length - 1]
                          }`
                    }
                  />
                  {/* ZERO IS NOT AN ANSWER, SO THE ROW IS NOT DRAWN AT ALL —
                      not as "0" and not as "nie wpisano", because at zero the
                      data cannot tell the two apart and either wording would
                      be a claim the app has no basis for. `emptySleepNight`
                      starts `awakenings` at 0 (api/diet.ts) and the stepper in
                      components/DietSleepPanel.tsx has 0 as its floor with no
                      empty state, so a night whose hours and quality were
                      filled in while the stepper was never touched arrives
                      here as 0 — indistinguishable from an unbroken night
                      somebody deliberately recorded. Printing "0 przebudzeń"
                      would report an answer nobody gave; printing "nie
                      wpisano" would deny one somebody may well have given.
                      Omitting the line says only what is true: this week's
                      record holds nothing about it. Above zero it is a real
                      figure and is shown plainly.

                      This is the same reading `hasSleep` in
                      utils/dietReport.ts already takes when it decides whether
                      a night was described at all, so the two agree.

                      TODO(§09): the honest fix is upstream and is a separate
                      job — `awakenings: number | null` in types/diet.ts and a
                      stepper that starts empty, which is what §05's "żadne
                      pole nie blokuje zapisu" means for the one field in this
                      module that cannot currently say "nie wpisano". When that
                      lands, this becomes an ordinary `Fact` with a nullable
                      value and a genuine 0 prints as 0. */}
                  {night.awakenings > 0 && (
                    <Fact label="Przebudzenia w nocy" value={String(night.awakenings)} />
                  )}
                  <Fact
                    label="Samopoczucie po wstaniu"
                    value={wakeFeelingLabel(night.wakeFeeling)}
                  />
                </ul>
              </dd>
            </div>
          )}

          {day.activity && (
            <div className="diet-report-group">
              <dt>Aktywność</dt>
              <dd>
                <ul className="diet-report-facts">
                  {day.activity.entries.map((entry) => {
                    const kind = activityKindLabel(entry.kind, entry.kindOther)
                    const length =
                      entry.durationMinutes === null
                        ? null
                        : formatDurationMinutes(entry.durationMinutes)
                    const feeling = feelingAfterLabel(entry.feelingAfter)
                    const parts = [kind, length].filter(Boolean).join(' · ')

                    return (
                      <li key={entry.id} className="diet-report-fact">
                        <span className="diet-report-fact-label">{entry.time}:</span>{' '}
                        <span className={parts ? undefined : 'diet-report-fact-empty'}>
                          {parts || 'zapisana bez szczegółów'}
                        </span>
                        {/* Its own line rather than trailing the activity on
                            the same one. Inline, it made the longest line in
                            the whole day — "18:30: Spacer · 45 min —
                            samopoczucie po: lepsze" — and the moment the three
                            short diaries sit in columns that line is the only
                            thing in the day that has to wrap, breaking after
                            the colon. The em dash goes with it: a dash joins
                            two halves of a sentence, and these are now two
                            lines. */}
                        {feeling && (
                          <span className="diet-report-fact-aside">
                            samopoczucie po: {feeling.toLowerCase()}
                          </span>
                        )}
                      </li>
                    )
                  })}
                  {/* Null stays null. "Nobody typed a step count" and "this
                      person took no steps" are different claims. */}
                  <Fact
                    label="Kroki"
                    value={day.activity.steps === null ? null : String(day.activity.steps)}
                  />
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}

const LOAD_ERROR = 'Nie udało się wczytać raportu.'
const PDF_ERROR = 'Nie udało się pobrać raportu. Spróbuj ponownie.'

function DietReportDetail() {
  const { id } = useParams<{ id: string }>()
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [report, setReport] = useState<DietWeeklyReport | null>(null)
  /** Initialised from whether there is anything to load, rather than set to
   *  false inside the effect: a route with no `:id` never fetches, and starting
   *  it true would render a loading line that resolves to nothing on the first
   *  pass. (The router always supplies one; the branch exists for the type.) */
  const [loading, setLoading] = useState(Boolean(id))
  /** Null while the report simply is not there — which is a 404 and a different
   *  statement from a failure. See the two branches below. */
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

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
        /* **A 404 IS NOT A FAILURE AND MUST NOT OFFER A RETRY.** A week nobody
           wrote in and a typed-in address answer the same way, and a second
           attempt answers the same — so it is reported as an absence, with a
           way back rather than a way to try again. Anything else (offline, a
           gate, a 500) is a failure and does offer one. */
        if (cause instanceof ApiError && cause.status === 404) {
          setReport(null)
          setLoadError(null)
          return
        }
        setLoadError(
          (cause instanceof ApiError && cause.formMessage) || LOAD_ERROR,
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, attempt])

  if (loading) {
    return (
      <div className="diet-report-page">
        <p className="diet-report-not-found">Wczytywanie raportu…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="diet-report-page">
        <LoadError
          className="diet-report-not-found"
          message={loadError}
          onRetry={() => {
            setLoading(true)
            setLoadError(null)
            setAttempt((n) => n + 1)
          }}
        />
        <Link className="diet-report-back-link" to={ROUTES.dietReports}>
          ← Wróć do raportów
        </Link>
      </div>
    )
  }

  if (!report) {
    /* The same answer the psychotherapy detail gives, and worded the same way:
       a typed-in address and a week nobody wrote in are indistinguishable, and
       neither tells the patient anything they can act on. */
    return (
      <div className="diet-report-page">
        <p className="diet-report-not-found">Nie znaleziono takiego raportu.</p>
        <Link className="diet-report-back-link" to={ROUTES.dietReports}>
          ← Wróć do raportów
        </Link>
      </div>
    )
  }

  async function downloadPdf(current: DietWeeklyReport) {
    setDownloading(true)
    setPdfError(null)
    try {
      saveBlob(await fetchDietReportPdf(current.id), dietReportPdfFileName(current))
    } catch (cause: unknown) {
      setPdfError((cause instanceof ApiError && cause.formMessage) || PDF_ERROR)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <DietReportBody
      report={report}
      onDownload={() => void downloadPdf(report)}
      downloading={downloading}
      downloadError={pdfError}
    />
  )
}

/**
 * The report itself, without the screen around it.
 *
 * **EXPORTED SO THE SPECIALIST'S COPY IS THE SAME DOCUMENT**, not a second one
 * that can drift: `pages/SpecialistPatientDietReport.tsx` renders this with a
 * different way back and the patient's name in the header. The rule is the one
 * the psychotherapy module already follows — two people in a consulting room
 * must not be holding different papers — and the only way to keep it is for
 * there to be one implementation.
 *
 * `backTo`, `subtitle` and `readerIsSubject` are the whole of the difference.
 * `onDownload` is optional because the two screens fetch the file from
 * different URLs (a patient's own report, or one of their specialist's
 * patients').
 *
 * `readerIsSubject` exists because one sentence on this page addresses the
 * person reading it as the person who wrote the diaries, and on the
 * specialist's copy that is somebody else — a psychodietitian was being told
 * that the report holds "to, co zapisałaś lub zapisałeś", about a week they did
 * not write. Everything else here is about the week rather than to the reader,
 * which is why it is one flag and not a second set of strings; the header's
 * `subtitle` already marks the same distinction for the same reason.
 */
export function DietReportBody({
  report,
  backTo = ROUTES.dietReports,
  subtitle,
  readerIsSubject = true,
  onDownload,
  downloading = false,
  downloadError,
}: {
  report: DietWeeklyReport
  backTo?: string
  subtitle?: string | null
  readerIsSubject?: boolean
  onDownload?: () => void
  downloading?: boolean
  downloadError?: string | null
}) {
  const { mealGrid } = report
  const filledDays = report.days.filter((day) => !day.empty).length

  /**
   * "Zestawienie tygodnia", one day at a time.
   *
   * ONE DAY A PAGE RATHER THAN THE HOUSE SEVEN, and the unit is the reason: on
   * every other list `PAGE_SIZE` counts rows of a few lines each, while a day
   * here is a block — up to five meals with their descriptions and chips, plus
   * three more diaries. Seven of them ran the card to some 3500px, which is a
   * week nobody reads to the end. A day is the thing this card is a list *of*,
   * so it is also the page.
   *
   * **THE WEEK DOES NOT DISAPPEAR WITH IT.** That was the one real objection to
   * paginating a document: a report is read as a week. But the two cards above
   * are the week — "Regularność wpisów" draws all seven chips and "Pory
   * posiłków" all seven rows — so what is paged here is the *detail*, which was
   * never readable at a glance anyway.
   *
   * `scrollToTop: false`, unlike every other caller: this list is one card
   * among five and a long way down the page, so jumping to the header would
   * hide the rows that just changed. See `hooks/usePagination.ts`.
   *
   * It costs the screen's one `?page=`, which is free here — nothing else on a
   * report paginates — and it keeps a day addressable: a link to page four is a
   * link to Thursday, and going back from a day returns to it.
   */
  const pages = usePagination(report.days, DAYS_PER_PAGE, { scrollToTop: false })

  return (
    <div className="diet-report-page">
      <header className="diet-report-header">
        <Link className="diet-report-back" to={backTo} aria-label="Wróć do raportów">
          ←
        </Link>
        <div className="diet-report-header-titles">
          <p className="diet-report-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Raport tygodniowy</h1>
          <p className="diet-report-range">{report.rangeLabel}</p>
          {/* Whose week it is — drawn only on the specialist's copy, where the
              reader is not the subject. */}
          {subtitle && <p className="diet-report-subtitle">{subtitle}</p>}
        </div>
        <HeaderMenu />
      </header>

      {/* The psychotherapy report's own hero card and "Pobierz PDF" — the same
          classes from reportDetail.css, so the two modules' downloads cannot
          drift apart. The lavender button this replaced sat on the lavender
          page and was barely visible. */}
      <section className="report-hero">
        <p className="report-hero-label">RAPORT TYGODNIOWY</p>
        <h2 className="report-hero-range">{report.rangeLabel}</h2>
        <p className="report-hero-meta">
          {filledDays} z {report.days.length} dni z wpisem
        </p>
        {onDownload && (
          <div className="report-hero-actions">
            <button
              type="button"
              className="report-hero-button"
              onClick={onDownload}
              disabled={downloading}
            >
              {downloading ? 'Przygotowywanie…' : 'Pobierz PDF'}
            </button>
          </div>
        )}
      </section>

      {downloadError && (
        <p className="report-pdf-status report-pdf-status-error" role="alert">
          {downloadError}
        </p>
      )}

      <section className="diet-report-card" aria-labelledby="diet-report-days-heading">
        <h2 id="diet-report-days-heading">Regularność wpisów</h2>
        {/* Seven chips in *this week's* order — starting on the day the
            patient's week starts, which is rarely a Monday. Ochre marks a day
            with an entry, and the state is also written out for a screen
            reader: colour on its own is not a message. Nothing here is red;
            a day without an entry is not an error. */}
        <ul className="diet-report-days">
          {report.days.map((day) => (
            <li
              key={day.date}
              className={
                day.empty
                  ? 'diet-report-day-chip'
                  : 'diet-report-day-chip diet-report-day-chip-filled'
              }
            >
              {/* The two visible spans are hidden from the accessible tree and
                  one sentence replaces them, which is the pattern the table's
                  row headers below already use. Read as they stood, the chip's
                  text content concatenated to "Śr9.09, z wpisem" — two spans
                  with no separator between them, which a screen reader has no
                  way to say sensibly. */}
              <span className="diet-report-day-chip-weekday" aria-hidden="true">
                {weekdayLabel(day.date)}
              </span>
              <span className="diet-report-day-chip-date" aria-hidden="true">
                {dietShortDayLabel(day.date)}
              </span>
              <span className="visually-hidden">
                {`${dietDayLabel(day.date)}, ${day.empty ? 'brak wpisu' : 'z wpisem'}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="diet-report-card" aria-labelledby="diet-report-slots-heading">
        <h2 id="diet-report-slots-heading">Pory posiłków</h2>
        <div className="diet-report-grid-scroll">
          <table className="diet-report-grid">
            <caption className="visually-hidden">
              Pory posiłków w tym tygodniu, dzień po dniu
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Dzień</span>
                </th>
                {mealGrid.slots.map((slot) => (
                  <th key={slot} scope="col">
                    {mealSlotLabel(slot)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mealGrid.rows.map((row) => (
                <tr key={row.date}>
                  <th scope="row">
                    <span aria-hidden="true">{weekdayLabel(row.date)}</span>
                    <span className="visually-hidden">{dietDayLabel(row.date)}</span>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.slot}>
                      {/* One dot per meal and no number anywhere — not a count
                          in the cell, not a total at the end of a row or a
                          column. Each dot names itself for a screen reader by
                          the meal's own kind, which is the same information the
                          dots carry and better than a tally. */}
                      {cell.meals.map((meal) => (
                        <span key={meal.id} className="diet-report-dot">
                          <span className="visually-hidden">{meal.kind ?? 'posiłek'}</span>
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Where the artboard puts it: after the meal times and before the
          day-by-day listing. The listing repeats every chip under the meal that
          felt it, so the summary reads first and the detail follows it. */}
      <EmotionRanking emotions={report.emotions} />

      <section className="diet-report-card" aria-labelledby="diet-report-week-heading">
        <h2 id="diet-report-week-heading">Zestawienie tygodnia</h2>
        {/* Blocks rather than a three-column table: the artboard's "DATA · CO
            SIĘ DZIAŁO · ZASTOSOWANE" does not survive a 390 px screen, and the
            third column has nothing behind it —
            TODO(§12): "Zastosowane" needs the psychodietetic technique
            catalogue, which this module does not have. */}
        <div className="diet-report-days-list">
          {pages.items.map((day) => (
            <DaySummary key={day.date} day={day} />
          ))}
        </div>
        <Pagination
          page={pages.page}
          pageCount={pages.pageCount}
          from={pages.from}
          to={pages.to}
          total={pages.total}
          onChange={pages.goTo}
          unit="dni"
        />
      </section>

      <p className="diet-report-footnote">
        {readerIsSubject
          ? 'Raport zawiera tylko to, co zapisałaś lub zapisałeś w dzienniczkach w tym ' +
            'tygodniu. Dni bez wpisu nie są niczym złym — po prostu ich tu nie ma.'
          : 'Raport zawiera tylko to, co pacjent zapisał w dzienniczkach w tym tygodniu. ' +
            'Dni bez wpisu nie są niczym złym — po prostu ich tu nie ma.'}
      </p>
    </div>
  )
}

export default DietReportDetail
