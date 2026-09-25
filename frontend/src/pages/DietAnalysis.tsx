import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AnalysisBarChart, { type BarRow } from '../components/AnalysisBarChart'
import EmotionCrossTable from '../components/EmotionCrossTable'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import ReportRankingBars, { type RankingRow } from '../components/ReportRankingBars'
import WeekdayTimeHeatmap, { type HeatmapReading } from '../components/WeekdayTimeHeatmap'
import { ApiError } from '../api/client'
import { fetchDietHistory } from '../api/diet'
import { daysGenitive } from '../utils/analysis'
import {
  DIET_HEATMAP_MIN_DAYS,
  DIET_HEATMAP_MIN_WEEKDAY_DAYS,
  MEAL_DENSITY_GRADIENT,
  buildDietAnalysis,
  mealDensityColor,
  timesPlural,
} from '../utils/dietAnalysis'
import { byAverageDescending, emotionRatingNote } from '../utils/dietReport'
import { EMOTION_COLORS } from '../utils/emotions'
import { pluralDays } from '../utils/reports'
import { TIME_OF_DAY_LABELS } from '../utils/timeOfDay'
import { mealsGenitive, pluralMeals } from '../utils/meals'
import type { DietAnalysis as DietAnalysisData } from '../types/dietAnalysis'
import type { DietJournalDay } from '../types/diet'
import { ROUTES } from '../routes'
import './dietAnalysis.css'

/**
 * "Analiza" — §11 of the diet mockups, over a rolling window of the food diary.
 *
 * WHAT IT IS, next to the module's other two listing screens. "Raporty" covers
 * seven fixed days counted from the patient's first entry, is listed in a
 * history and answers "co się działo w tamtym tygodniu". This answers "o jakich
 * porach zwykle jem", which needs a longer, continuously moving stretch, is
 * recomputed every time it opens and is stored nowhere. That is why there is no
 * PDF here, nothing that sends anything to a specialist and no archive of past
 * analyses: those are properties of a document, and this is a view.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, because the psychotherapy "Analiza" does and
 * copying it would break this module's own rules:
 *
 * - **no closing paragraph.** That screen ends on "Trudniej bywa Ci we wtorki" —
 *   a conclusion. §11's own words are "wykres pokazuje, kiedy coś się działo, i
 *   nie dopisuje, co to znaczy", and §10's are "bez ocen, bez wniosków". The
 *   charts here say what was recorded and stop.
 * - **no summary cards.** "Najtrudniejszy dzień" and "Trudna pora dnia" rest on
 *   a 0-10 difficulty averaged from the mood tiles, the stress chip and two
 *   sliders. This module asks none of those four questions, and a "trudny dzień
 *   żywieniowy" invented to fill the gap would be a verdict on somebody's food —
 *   which §15 rules out by name.
 * - **no fraction, percentage or progress bar.** Every number on this screen is
 *   a plain count of days, the same rule `core/diet_reports.py` is built under.
 *
 * **THE EMOTION CARDS ARE THE ONE EXCEPTION TO THE THIRD RULE ABOVE, AND THE
 * LINE IS WHAT THE NUMBER IS ABOUT.** They count meals and they average a 0-10
 * intensity. That intensity is a slider the patient moved herself on §04's
 * picker — the psychotherapy form's picker, the same ten names — so it is her
 * answer read back rather than this screen grading her eating. Nothing about
 * the food feeds it: the description is an input to no figure, and the kind and
 * the hour are used only to say *when* a feeling came up. A card here that
 * began describing the meals would have crossed the line.
 *
 * WHAT IS STILL MISSING IS MISSING FROM THE BACKEND, not from here. Two of
 * §11's charts read a psychodietetic context of a meal that has no column at
 * all (§05's two hunger scales, the situation before a meal); sleep, activity
 * and hydration have no endpoint reaching further back than a day or a week.
 * Both lists, with the names of the server-side functions that already exist,
 * are at the head of `utils/dietAnalysis.ts`.
 */

const LOAD_ERROR = 'Nie udało się wczytać Twojej analizy. Spróbuj ponownie.'

/** "…z 41 posiłków z ostatnich 23 dni" — the real span, never a flat "30 dni".
 *
 * The window grows with the account until it reaches its ceiling, so a caption
 * saying "30 dni" to somebody eleven days in would be describing a period that
 * does not exist yet. Lifted, reasoning and all, from `windowCaption` on the
 * psychotherapy screen — the one thing about that screen worth copying here. */
function windowCaption(analysis: DietAnalysisData): string {
  const { mealCount, days } = analysis.window
  const period = days === 1 ? 'z dzisiaj' : `z ostatnich ${days} ${daysGenitive(days)}`
  return `Wyliczone automatycznie z ${mealCount} ${mealsGenitive(mealCount)} ${period}.`
}

/** The grid's squares, as the shared component reads them. `observations` is
 *  carried across because both the shade and the second half of the spoken
 *  reading are counted out of it — see `squareColor` and `describeCell`. */
function heatmapReadings(analysis: DietAnalysisData): HeatmapReading[] {
  return analysis.heatmap.cells.map((cell) => ({
    weekday: cell.weekday,
    timeOfDay: cell.slot,
    value: cell.days,
    observations: cell.observedDays,
  }))
}

/**
 * A square's shade, or null for a square this screen will not shade.
 *
 * **THE DENOMINATOR IS THE SQUARE'S OWN WEEKDAY, NEVER THE GRID.** Thirty days
 * do not divide by seven: two weekdays fall five times inside the window and
 * five fall four times. Shaded against the fullest square on the grid, a patient
 * who ate at exactly the same hours every single day came out with two columns
 * at full depth and five a fifth lighter — and because the window rolls, which
 * two moved forward by one every day, so a "pattern" walked across her grid
 * while her eating did not change at all. The same arithmetic hid real
 * differences the other way round: breakfast on four of five Mondays and on four
 * of four Tuesdays both counted 4 and drew the same colour.
 *
 * Below DIET_HEATMAP_MIN_WEEKDAY_DAYS observations there is no shade at all. One
 * observed Saturday would otherwise put the whole Saturday column at full depth
 * on one day of evidence — the mistake DIET_HEATMAP_MIN_DAYS guards the map
 * against, one level down, where it guards nothing.
 */
function squareColor(reading: HeatmapReading): string | null {
  const observed = reading.observations ?? 0
  if (reading.value === null || observed < DIET_HEATMAP_MIN_WEEKDAY_DAYS) return null
  return mealDensityColor(reading.value / observed)
}

/**
 * What one square says out loud.
 *
 * Three readings, and each of the three is a different thing to say: a weekday
 * nobody has written a timed meal on reads "brak wpisu" and is drawn as an
 * outline; a weekday in the record on too few days is hatched and says so; a
 * weekday that *is* in the record and simply held no meal at this hour reads "0
 * dni" and takes the ramp's palest colour. Collapsing any two would let "nie
 * wiemy nic o Twoich niedzielach" render identically to "w niedziele nic nie
 * jesz".
 *
 * **THE SECOND NUMBER IS NOT A FRACTION AND MUST NOT BE REMOVED AS ONE.** "4 dni
 * z posiłkiem" cannot be compared with the Tuesday beside it unless the reader
 * also knows how many Mondays and how many Tuesdays the window held — and it
 * held five of one and four of the other, because thirty does not divide by
 * seven. So the square says two plain counts, in two clauses, each a number of
 * days: what happened, and how many days of that weekday there were. What §15
 * rules out is a fraction offered as a verdict — "6 z 7 dni" is a regularity
 * score dressed as arithmetic, and the ban is on the score. A denominator the
 * reader needs in order not to be misled is the opposite of a score, and
 * deleting it to "remove a fraction" would put the misleading reading back.
 * Never "4 z 5" and never a percentage: the two numbers stay in separate
 * clauses, so neither the eye nor a screen reader can take them as a ratio.
 */
function describeCell(reading: HeatmapReading | null): string {
  if (reading === null || reading.value === null) return 'brak wpisu'

  const observed = reading.observations ?? 0
  const context = `ten dzień tygodnia wypadł w tym okresie ${observed} ${timesPlural(observed)}`

  if (observed < DIET_HEATMAP_MIN_WEEKDAY_DAYS) {
    // No count of meals here on purpose. The point of the hatch is that one day
    // is not yet something to read, and printing "1 dzień z posiłkiem" beside
    // "wypadł 1 raz" invites exactly the reading the hatch withholds.
    return `za mało dni, żeby pokazać kolor; ${context}`
  }

  return `${reading.value} ${pluralDays(reading.value)} z posiłkiem; ${context}`
}

/**
 * The four bars.
 *
 * One colour for all of them, deliberately: the hue is the module's accent and
 * carries no meaning of its own, so singling the tallest one out — as the
 * artboard does — would turn a height into a verdict.
 *
 * `--color-ochre-text` rather than `--color-ochre`, which is what the artboard
 * draws these bars in: a bar is the thing carrying the reading, and the pale
 * gold sits at about 1,7:1 against the track behind it — a shape you cannot
 * reliably see the end of is a chart that has to be read off its numbers. The
 * readable ochre clears 4,5:1 on the same track and is still recognisably the
 * module's colour.
 */
function slotBars(analysis: DietAnalysisData): BarRow[] {
  return analysis.slots.map((share) => ({
    key: share.slot,
    label: TIME_OF_DAY_LABELS[share.slot],
    value: share.days,
    color: 'var(--color-ochre-text)',
    title: `${TIME_OF_DAY_LABELS[share.slot]}: ${share.days} ${pluralDays(share.days)} z posiłkiem o tej porze`,
  }))
}

/**
 * The emotions ranking, as the shared bars read it.
 *
 * `measure` stays at its default 'count': the bar draws how *often* a feeling
 * came up, which is what §11 asks this chart for. The same component draws the
 * psychotherapy report's ranking against intensity, because that section is
 * named for strength — `ReportRankingBars` carries the argument.
 *
 * The same rows the weekly report builds, deliberately: §10's card and this one
 * ask one question over two stretches of time, and a patient crossing between
 * them must not meet two units. `emotionRatingNote` is shared for the same
 * reason.
 */
function emotionRows(analysis: DietAnalysisData): RankingRow[] {
  return analysis.emotions.ranking.map((share) => ({
    label: share.emotion,
    count: share.meals,
    // The app's one palette, the same colours the chips under each meal use.
    color: EMOTION_COLORS[share.emotion],
    average: share.avgIntensity,
    note: emotionRatingNote(share),
  })).sort(byAverageDescending)
}

/**
 * §11's three emotion charts — the ranking and the crossings under it.
 *
 * Renders nothing for a window holding no chip at all. An empty ranking, or a
 * "brak emocji", would read as a question the patient failed to answer; §05's
 * rule is that no field blocks a save, so meals saved without an emotion are
 * ordinary meals and the screen simply has fewer cards. The same rule
 * `MealEmotions` follows for one meal and `EmotionRanking` for a report.
 *
 * THE CROSSINGS ARE DRAWN ONLY WHEN THE RANKING IS, and they are not gated on
 * anything further. That is a real decision and it differs from the heat map
 * above, which hides itself below DIET_HEATMAP_MIN_DAYS: that map's squares are
 * *shaded* and a shade is read as a claim about a habit even when it rests on
 * one day, so it has to be withheld. Every cell here prints its own count, so a
 * table drawn from three meals says "1", "1" and "1" and is read as exactly
 * that. Withholding it would mean withholding the only record the patient has
 * of what she wrote.
 */
function EmotionCards({ analysis }: { analysis: DietAnalysisData }) {
  const { emotions } = analysis
  if (emotions.ranking.length === 0) return null

  const { mealsWithEmotion } = emotions

  return (
    <>
      <section className="diet-analysis-card">
        <h2>Najczęstsze emocje przy jedzeniu</h2>
        {/* One meal may carry several chips, so the rows can add up to more than
            the meals behind them. The count is said before the bars for the
            reason the heat map's second number exists: a figure the reader
            cannot place is a figure they will place wrongly. */}
        <p className="diet-analysis-card-subtitle">
          Z {mealsWithEmotion} {mealsGenitive(mealsWithEmotion)} z tego okresu, przy których
          zapisałaś lub zapisałeś emocję
        </p>
        <ReportRankingBars
          rows={emotionRows(analysis)}
          // Unreachable: the card returns null above rather than drawing an
          // empty ranking. Worded as the ordinary answer it would be anyway.
          emptyText="W tym okresie nie ma posiłku z zapisaną emocją."
          measure="average"
          countLabel={pluralMeals}
        />
        <p className="diet-analysis-aside">
          Pasek pokazuje średnie natężenie emocji w skali 0–10, które oceniłaś lub oceniłeś na
          suwaku — nie ocenia jedzenia. Liczba mówi, przy ilu posiłkach pojawiła się dana emocja.
        </p>
      </section>

      <section className="diet-analysis-card">
        <h2>Emocje a pora dnia</h2>
        <p className="diet-analysis-card-subtitle">
          Liczba posiłków z daną emocją według pory dnia
        </p>
        <EmotionCrossTable
          cross={emotions.byTimeOfDay}
          caption="Liczba posiłków z daną emocją, według pory dnia"
        />
        {/* The one sentence the colour needs, and it has to keep being said: a
            grid of tints invites a comparison between rows that the shading
            does not support. */}
        <p className="diet-analysis-aside">
          Kolor porównuje pory dnia w obrębie jednego wiersza — pokazuje, kiedy dana emocja
          wracała najczęściej. Nie porównuje emocji między sobą; do tego jest wykres wyżej.
        </p>
      </section>

      <section className="diet-analysis-card">
        <h2>Emocje a rodzaj posiłku</h2>
        <p className="diet-analysis-card-subtitle">
          Liczba posiłków z daną emocją według rodzaju posiłku
        </p>
        <EmotionCrossTable
          cross={emotions.byKind}
          caption="Liczba posiłków z daną emocją, według rodzaju posiłku"
        />
        <p className="diet-analysis-aside">
          Kreska oznacza rodzaj posiłku, którego w tym okresie nie ma — to nie to samo co zero.
        </p>
      </section>

      <section className="diet-analysis-card">
        <h2>Emocje w czasie</h2>
        <p className="diet-analysis-card-subtitle">
          Liczba posiłków z daną emocją w kolejnych tygodniach okresu
        </p>
        <EmotionCrossTable
          cross={emotions.byWeek}
          caption="Liczba posiłków z daną emocją, tydzień po tygodniu"
        />
        {/* Said plainly, because the last column is usually short (thirty days
            is four sevens and two) and a column standing for two days would
            otherwise read as a quiet week. */}
        <p className="diet-analysis-aside">
          Tygodnie liczone są od pierwszego dnia okresu, więc ostatni bywa krótszy — jego daty
          są w podpowiedzi nagłówka. To nie są tygodnie z raportów, które liczą się od Twojego
          pierwszego wpisu.
        </p>
      </section>
    </>
  )
}

/** The screen for somebody who has never saved a meal. Empty charts and a row of
 *  zeroes would read as a broken screen rather than as a new one. */
function EmptyAnalysis() {
  return (
    <section className="diet-analysis-empty-state">
      <h2>Jeszcze nic tu nie ma</h2>
      <p>
        Twoja analiza pojawi się, gdy zaczniesz zapisywać posiłki. Wystarczy kilka dni, żeby
        zobaczyć tu pierwsze pory dnia.
      </p>
      <Link to={ROUTES.dietMeal} className="diet-analysis-empty-button">
        Dodaj posiłek
      </Link>
    </section>
  )
}

function DietAnalysis() {
  /**
   * Fixed for the life of the screen, so a render at midnight cannot move the
   * window under the charts mid-session.
   *
   * Deliberately **not** `useCurrentDay`, which the module's writing screens use
   * so that a phone left open overnight stops editing yesterday. Nothing here is
   * editable and nothing is locked by the date, so the only thing a rollover
   * could do is redraw every chart under somebody's finger. The psychotherapy
   * "Analiza" freezes it for the same reason.
   */
  const today = useMemo(() => new Date(), [])

  const [history, setHistory] = useState<DietJournalDay[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by "Spróbuj ponownie"; the effect lists it as a dependency, so trying
  // again re-runs the one load rather than a second copy of it.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetchDietHistory()
      .then((loaded) => {
        if (cancelled) return
        setHistory(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        // The server's own sentence first: every refusal a patient can actually
        // reach here is a gate (an unlinked minor, withdrawn consents) and
        // arrives with a message saying what to do about it.
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
    setAttempt((value) => value + 1)
  }

  const analysis = useMemo(() => buildDietAnalysis(history, today), [history, today])

  const hasWindow = analysis !== null && analysis.window.daysWithMeal > 0

  return (
    <div className="diet-analysis-page">
      <header className="diet-analysis-header">
        <Link
          className="diet-analysis-back"
          to={ROUTES.diet}
          aria-label="Wróć do strony głównej modułu dietetycznego"
        >
          ←
        </Link>
        <div className="diet-analysis-header-titles">
          <p className="diet-analysis-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Analiza</h1>
        </div>
        <HeaderMenu />
      </header>

      {loading && (
        <p className="diet-analysis-status" role="status" aria-busy="true">
          Wczytywanie Twojej analizy…
        </p>
      )}

      {/* **A FAILED LOAD IS NEVER DRAWN AS AN EMPTY SCREEN.** "Jeszcze nic tu nie
          ma" shown to somebody with a month of meals behind them is the mistake
          `Journals.tsx` and `DietReports.tsx` are both careful about. */}
      {!loading && loadError && (
        <LoadError
          className="diet-analysis-status diet-analysis-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {/* A patient with meals but none in the window is not the same as one who
          has never saved anything, and must not be told the same thing. */}
      {!loading && !loadError && analysis === null && <EmptyAnalysis />}

      {!loading && !loadError && analysis !== null && analysis.window.daysWithMeal === 0 && (
        <section className="diet-analysis-empty-state">
          <h2>Brak wpisów z tego okresu</h2>
          {/* "w … dniach", the locative — not `daysGenitive`, which is right
              after "z" and wrong after "w" ("W ostatnich 30 dni" is not
              Polish). Always the plural form, because this branch cannot be
              reached with a one-day window: a window that short means the first
              meal is today, and then today is in it. */}
          <p>
            W ostatnich {analysis.window.days} dniach nie ma żadnego posiłku, więc nie ma czego
            rozłożyć na pory dnia. Zapisz dzisiejszy — analiza zacznie się wypełniać od razu.
          </p>
          <Link to={ROUTES.dietMeal} className="diet-analysis-empty-button">
            Dodaj posiłek
          </Link>
        </section>
      )}

      {!loading && !loadError && hasWindow && analysis !== null && (
        <>
          <p className="diet-analysis-caption">{windowCaption(analysis)}</p>

          <section className="diet-analysis-card">
            <h2>Regularność posiłków</h2>
            <p className="diet-analysis-card-subtitle">Dzień tygodnia i pora dnia</p>
            <WeekdayTimeHeatmap
              readings={heatmapReadings(analysis)}
              unlocked={analysis.heatmap.unlocked}
              // One sentence naming what is still missing. No progress bar and
              // no percentage — §11 asks for exactly this, and a bar would turn
              // "jeszcze za mało" into a target to hit.
              lockedText={`Mapa pojawi się, gdy zbierze się co najmniej ${DIET_HEATMAP_MIN_DAYS} dni z posiłkiem zapisanym z godziną.`}
              caption="Liczba dni z posiłkiem według dnia tygodnia i pory dnia."
              color={squareColor}
              describe={describeCell}
              legend={{ gradient: MEAL_DENSITY_GRADIENT, from: 'rzadziej', to: 'częściej' }}
              note={
                <>
                  Kolor pokazuje, w ilu dniach o tej porze pojawił się posiłek — liczony osobno dla
                  każdego dnia tygodnia, bo w tym okresie jedne dni tygodnia wypadają częściej niż
                  inne. Pola w ukośne paski to dni tygodnia, które wypadły w tym okresie mniej niż{' '}
                  {DIET_HEATMAP_MIN_WEEKDAY_DAYS} razy — za mało, żeby je zabarwić. Puste pola to
                  dni tygodnia, z których nie ma jeszcze żadnego posiłku zapisanego z godziną.
                </>
              }
            />
          </section>

          <section className="diet-analysis-card">
            <h2>Pory posiłków</h2>
            {/* The subtitle has to say what a bar counts, because the chart
                cannot: a bar of zero is drawn as a floor line either way, and it
                only means "nic o tej porze" if the reader knows the window holds
                days that were measured at all. */}
            <p className="diet-analysis-card-subtitle">
              Liczba dni okresu, w których pojawił się posiłek o danej porze
            </p>
            <AnalysisBarChart
              // Nothing to draw rather than four zeroes: with no meal carrying an
              // hour anywhere in the window, a zero would claim a measurement
              // that was never possible.
              rows={analysis.heatmap.timedDays === 0 ? [] : slotBars(analysis)}
              emptyText="Żaden posiłek z tego okresu nie ma zapisanej godziny, więc nie ma czego rozłożyć na pory dnia."
              // An absolute ceiling, not the tallest bar: the bars mean "days out
              // of the ones we can place", and scaling them against each other
              // would draw three days out of twenty as a full column.
              max={analysis.heatmap.timedDays}
            />
            {analysis.untimedMeals > 0 && (
              <p className="diet-analysis-aside">
                {pluralMeals(analysis.untimedMeals)} z tego okresu zapisano bez godziny — nie ma ich
                na wykresie ani na mapie.
              </p>
            )}
          </section>

          <EmotionCards analysis={analysis} />

          <section className="diet-analysis-note-banner">
            <span aria-hidden="true">ⓘ</span>
            <p>
              Analiza pokazuje tylko to, co zapisałaś lub zapisałeś. Dni bez wpisu nie są liczone
              jako gorsze — po prostu ich tu nie ma.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

export default DietAnalysis
