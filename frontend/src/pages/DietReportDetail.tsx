import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import { useCurrentDay } from '../hooks/useCurrentDay'
import { loadDietReport } from '../api/diet'
import { fromIsoDate } from '../utils/days'
import { dietDayLabel, dietShortDayLabel } from '../utils/dietWeeks'
import { mealSlotLabel } from '../utils/dietReport'
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
 * TODO(§05): "Najczęstsze emocje przy jedzeniu", "Głód fizyczny wobec
 * emocjonalnego" and "Sytuacje jedzenia emocjonalnego" — the three sections the
 * mockup puts between the meal times and the day-by-day listing. Every one of
 * them reads the psychodietetic context of a meal, which is §05: none of those
 * columns exists in `diet_meal`, and §04/§05's form that would write them is
 * not built. They belong right here, after the meal-times card, when it is.
 *
 * TODO(§10): "Zmiany od ostatniej wizyty" — the card between the listing and
 * the footer on the artboard. Three things are missing at once: the one pair
 * the mockup says a report may compare is the two hungers (§05, neither
 * exists), the app does not know when a visit happened, and comparing meal or
 * entry counts week to week would be a verdict on regularity, which this module
 * does not pass.
 *
 * TODO(backend): "Pobierz PDF", which the artboard puts at the foot of this
 * screen. In the psychotherapy module the file is rendered by the server
 * (`core/report_pdf.py`, ReportLab, its own throttle) and fetched with the
 * session cookie; there is no such renderer for this module. A button that did
 * nothing, or that produced something the browser drew itself and called the
 * report, is worse than no button. It goes below the footer note when the
 * endpoint exists.
 *
 * TODO(klientka): no "Udostępnij" and no "Wyślij", and no note about who else
 * reads this — both are argued on pages/DietReports.tsx, where the same two
 * absences are visible on the list.
 */

const NOT_ANSWERED = 'nie wpisano'

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
            <>
              <dt>Posiłki</dt>
              <dd>
                <ul className="diet-report-meals">
                  {day.meals.map((meal) => (
                    <MealLine key={meal.id} meal={meal} />
                  ))}
                </ul>
              </dd>
            </>
          )}

          {day.hydration && (
            <>
              <dt>Nawodnienie</dt>
              <dd>
                {/* As the hydration screen counts it, and nothing more: no
                    goal, no share of it, no comparison with another day. The
                    figure is the server's own, formatted and not recomputed. */}
                <ul className="diet-report-facts">
                  <Fact
                    label="Woda"
                    value={`${formatGlasses(day.hydration.glasses)} ${pluralGlasses(
                      day.hydration.glasses,
                    )}`}
                  />
                </ul>
              </dd>
            </>
          )}

          {night && (
            <>
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
            </>
          )}

          {day.activity && (
            <>
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
                        {feeling && (
                          <span className="diet-report-fact-aside">
                            {' '}
                            — samopoczucie po: {feeling.toLowerCase()}
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
            </>
          )}
        </dl>
      )}
    </div>
  )
}

function DietReportDetail() {
  const { id } = useParams<{ id: string }>()
  /* Live, like the list: a report opened before midnight stays the report it
     was, but the screen must not hold a stale day to derive it from. */
  const currentDay = useCurrentDay()
  const report = useMemo(
    () => (id ? loadDietReport(id, fromIsoDate(currentDay)) : null),
    [id, currentDay],
  )

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

  return <ReportBody report={report} />
}

function ReportBody({ report }: { report: DietWeeklyReport }) {
  const { mealGrid } = report

  return (
    <div className="diet-report-page">
      <header className="diet-report-header">
        <Link
          className="diet-report-back"
          to={ROUTES.dietReports}
          aria-label="Wróć do raportów"
        >
          ←
        </Link>
        <div className="diet-report-header-titles">
          <p className="diet-report-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Raport tygodniowy</h1>
          <p className="diet-report-range">{report.rangeLabel}</p>
        </div>
        <HeaderMenu />
      </header>

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

      <section className="diet-report-card" aria-labelledby="diet-report-week-heading">
        <h2 id="diet-report-week-heading">Zestawienie tygodnia</h2>
        {/* Blocks rather than a three-column table: the artboard's "DATA · CO
            SIĘ DZIAŁO · ZASTOSOWANE" does not survive a 390 px screen, and the
            third column has nothing behind it —
            TODO(§12): "Zastosowane" needs the psychodietetic technique
            catalogue, which this module does not have. */}
        <div className="diet-report-days-list">
          {report.days.map((day) => (
            <DaySummary key={day.date} day={day} />
          ))}
        </div>
      </section>

      <p className="diet-report-footnote">
        Raport zawiera tylko to, co zapisałaś lub zapisałeś w dzienniczkach w tym tygodniu.
        Dni bez wpisu nie są niczym złym — po prostu ich tu nie ma.
      </p>
    </div>
  )
}

export default DietReportDetail
