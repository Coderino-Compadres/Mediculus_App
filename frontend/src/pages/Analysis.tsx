import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AnalysisBarChart, { type BarRow } from '../components/AnalysisBarChart'
import EmotionHeatmap from '../components/EmotionHeatmap'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import TrendChart from '../components/TrendChart'
import { ApiError } from '../api/client'
import { fetchYearFrequency } from '../api/analysis'
import { fetchJournalEntries } from '../api/diary'
import {
  ANALYSIS_WINDOW_DAYS,
  DEFAULT_FREQUENCY_PERIOD,
  FREQUENCY_PERIODS,
  buildFrequency,
  MOOD_SCALE_MAX,
  WEEKDAYS,
  buildAnalysis,
  daysGenitive,
  entriesGenitive,
  sageShade,
} from '../utils/analysis'
import { formatNumber, pluralDays } from '../utils/reports'
import { TIME_OF_DAY_LABELS } from '../utils/timeOfDay'
import type {
  Analysis as AnalysisData,
  FrequencyBucket,
  FrequencySelection,
  YearFrequency,
} from '../types/analysis'
import type { JournalListEntry } from '../types/diaryEntry'
import { ROUTES } from '../routes'
import './journals.css'
import './analysis.css'

/**
 * "Analiza" — the patterns behind the diary, over a rolling window.
 *
 * Deliberately not a second reports screen. A weekly report covers one fixed
 * Monday-Sunday week, is generated once, kept in a history and exported to PDF
 * for the specialist treating the patient; it answers "how was this week". This
 * screen answers "when, and in what situations, do I tend to have a harder
 * time" — which needs a longer, continuously moving stretch of history, is
 * recomputed every time it opens and is stored nowhere.
 *
 * That difference is why there is no PDF button here, nothing that sends
 * anything to a specialist, and no archive of past analyses: those are
 * properties of a document, and this is a view. There is also no
 * week/month/quarter switch — the window is one rolling period the team settled
 * on, not a control.
 *
 * The numbers come from the same GET /api/diary/ that "Dzienniczki" reads, and
 * are aggregated by `utils/analysis.ts` in the browser, so no figure here can
 * disagree with the entry it was computed from.
 */

const FREQUENCY_LOAD_ERROR =
  'Nie udało się wczytać częstotliwości wpisów dla tego roku.'

const LOAD_ERROR = 'Nie udało się wczytać Twojej analizy. Spróbuj ponownie.'

/** Placeholder for a card the patient has not given enough answers to fill. */
const NO_VALUE = '—'

/** "…z 12 wpisów z ostatnich 23 dni" — the real span, never a flat "30 dni".
 *
 * The window grows with the account until it reaches its ceiling, so a caption
 * saying "30 dni" to somebody twelve days in would be describing a period that
 * does not exist yet. */
function windowCaption(analysis: AnalysisData): string {
  const { entryCount, days } = analysis.window
  const period = days === 1 ? 'z dzisiaj' : `z ostatnich ${days} ${daysGenitive(days)}`
  return `Wyliczone automatycznie z ${entryCount} ${entriesGenitive(entryCount)} ${period}.`
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  /** Set only for the emotion card — its value is drawn in the emotion's own colour. */
  color?: string
}) {
  return (
    <div className="analysis-summary-card">
      <p className="analysis-summary-label">{label}</p>
      <p className="analysis-summary-value" style={color ? { color } : undefined}>
        {color && <span className="analysis-summary-dot" style={{ backgroundColor: color }} />}
        {value}
      </p>
    </div>
  )
}

function emotionBars(analysis: AnalysisData): BarRow[] {
  return analysis.emotions.map((share) => ({
    key: share.emotion,
    label: share.emotion,
    value: share.days,
    // Always the one palette — an emotion's colour is defined in exactly one
    // place (utils/emotions.ts) and every screen reads it from there.
    color: share.color,
    title: `${share.emotion}: ${share.days} ${pluralDays(share.days)} w tym okresie`,
  }))
}

/** The subtitle carries the bucket, because the section no longer shares the
 *  screen's window and a bare "Dni z wpisem" would leave that ambiguous. */
function frequencySubtitle(selection: FrequencySelection): string {
  return selection.kind === 'year' ? 'Dni z wpisem w miesiącu' : 'Dni z wpisem w tygodniu'
}

function frequencyBars(buckets: FrequencyBucket[]): BarRow[] {
  const longest = Math.max(...buckets.map((bucket) => bucket.length), 1)
  return buckets.map((bucket) => ({
    key: bucket.label,
    // A stretch shorter than a whole week or month says so under the bar, not
    // only in the tooltip: the newest one covers whatever has happened so far,
    // and a patient who wrote on both days of a two-day stretch would otherwise
    // see a bar at two sevenths labelled "Tyg. 5" and read it as having nearly
    // stopped writing. This is a PWA on a phone — there is no hover to discover
    // the real denominator with.
    label: bucket.partial
      ? `${bucket.label} (${bucket.length} ${pluralDays(bucket.length)})`
      : bucket.label,
    value: bucket.days,
    // Deeper sage the fuller the stretch — one hue, so the bars read as a series
    // rather than as categories that mean something different from one another.
    color: sageShade(bucket.days / longest),
    title: `${bucket.label} (${bucket.rangeLabel}): ${bucket.days} z ${bucket.length} ${daysGenitive(bucket.length)} z wpisem`,
  }))
}

/** The screen for somebody who has never written an entry. Empty charts and a
 *  column of zeroes would read as a broken screen rather than as a new one. */
function EmptyAnalysis() {
  return (
    <section className="analysis-empty-state">
      <h2>Jeszcze nic tu nie ma</h2>
      <p>
        Twoja analiza pojawi się, gdy zaczniesz zapisywać wpisy w dzienniczku. Wystarczy kilka dni,
        żeby zobaczyć tu pierwsze zależności.
      </p>
      <Link to={ROUTES.diaryEntry} className="analysis-empty-button">
        Dodaj wpis
      </Link>
    </section>
  )
}

/**
 * The named-year half of "Częstotliwość wpisów", fetched rather than computed.
 *
 * Its own request, its own loading and error state: the rest of the screen is
 * already on screen when somebody picks a year, and making the whole page go
 * back to "Wczytywanie…" for one chart would throw away everything they were
 * reading.
 *
 * `yearsWithEntries` is kept across selections — it arrives with every answer
 * and does not change while the screen is open, so re-picking a year must not
 * empty the picker the pick was made from.
 */
function useYearFrequency(selection: FrequencySelection) {
  const [data, setData] = useState<YearFrequency | null>(null)
  const [years, setYears] = useState<number[]>([])
  // Bumped by the retry button, and part of what marks a failure stale, so
  // trying the same year again is a new attempt rather than a no-op.
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{ year: number; attempt: number } | null>(null)
  const wanted = selection.kind === 'year' ? selection.year : null

  useEffect(() => {
    if (wanted === null) return
    let cancelled = false

    fetchYearFrequency(wanted)
      .then((answer) => {
        if (cancelled) return
        setData(answer)
        setYears(answer.yearsWithEntries)
      })
      .catch(() => {
        // Said out loud rather than drawn as an empty chart: "nothing came back"
        // and "you wrote nothing that year" are the two readings this section
        // must never confuse, which is the whole reason it is not derived in the
        // browser in the first place.
        if (!cancelled) setFailure({ year: wanted, attempt })
      })

    return () => {
      cancelled = true
    }
  }, [wanted, attempt])

  // Derived during render rather than set from inside the effect: a synchronous
  // setState there costs a second render pass for a value both branches already
  // know. `data` is only honoured for the year actually asked for, so switching
  // years shows the spinner instead of the previous year's bars under the new
  // year's heading.
  const ready = wanted !== null && data?.year === wanted ? data : null
  const failed = wanted !== null && failure?.year === wanted && failure.attempt === attempt

  return {
    data: ready,
    // Kept across selections: the list arrives with every answer and does not
    // change while the screen is open, so re-picking must not empty the picker
    // the pick was made from.
    years,
    loading: wanted !== null && ready === null && !failed,
    failed,
    retry: () => setAttempt((value) => value + 1),
  }
}

function Analysis() {
  // Fixed for the life of the screen, so a render at midnight cannot move the
  // window under the charts mid-session.
  const today = useMemo(() => new Date(), [])

  const [entries, setEntries] = useState<JournalListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by the retry button; the effect lists it as a dependency, so trying
  // again re-runs the one load rather than a second copy of it.
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)

  useEffect(() => {
    let cancelled = false

    fetchJournalEntries()
      .then((history) => {
        if (cancelled) return
        setEntries(history)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const analysis = useMemo(() => buildAnalysis(entries, today), [entries, today])

  // Its own period, and its own memo: this chart reads past the window the rest
  // of the screen is capped at, so it is built from `entries` rather than from
  // `analysis`. Recomputed only when the chip changes, not on every render.
  const [selection, setSelection] = useState<FrequencySelection>({
    kind: 'rolling',
    id: DEFAULT_FREQUENCY_PERIOD,
  })
  const rolling = useMemo(
    () => (selection.kind === 'rolling' ? buildFrequency(entries, today, selection.id) : []),
    [entries, today, selection],
  )
  const year = useYearFrequency(selection)
  const yearOptions = year.years
  const frequency = selection.kind === 'year' ? (year.data?.buckets ?? []) : rolling

  return (
    <div className="journals-page analysis-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Analiza</h1>
        </div>
        <HeaderMenu />
      </header>

      {loading && (
        <div className="journals-status" role="status" aria-busy="true">
          Wczytywanie Twojej analizy…
        </div>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {/* A patient with entries but none in the window is not the same as one who
          has never written anything, and must not be told the same thing. */}
      {!loading && !loadError && analysis === null && <EmptyAnalysis />}

      {!loading && !loadError && analysis !== null && analysis.window.entryCount === 0 && (
        <section className="analysis-empty-state">
          <h2>Brak wpisów z tego okresu</h2>
          <p>
            W ostatnich {ANALYSIS_WINDOW_DAYS} dniach nie ma żadnego wpisu, więc nie ma z czego
            policzyć wzorców. Zapisz dzisiejszy — analiza zacznie się wypełniać od razu.
          </p>
          <Link to={ROUTES.diaryEntry} className="analysis-empty-button">
            Dodaj wpis
          </Link>
        </section>
      )}

      {!loading && !loadError && analysis !== null && analysis.window.entryCount > 0 && (
        <>
          <p className="analysis-caption">{windowCaption(analysis)}</p>

          <TrendChart points={analysis.trend} days={analysis.trend.length} />

          <section className="analysis-summary" aria-label="Podsumowanie okresu">
            <SummaryCard
              label="Najczęstsza emocja"
              value={analysis.summary.topEmotion?.emotion ?? NO_VALUE}
              color={analysis.summary.topEmotion?.color}
            />
            <SummaryCard
              label="Średni nastrój"
              value={
                analysis.summary.averageMood === null
                  ? NO_VALUE
                  : `${formatNumber(analysis.summary.averageMood, 1)} / ${MOOD_SCALE_MAX}`
              }
            />
            <SummaryCard
              label="Najtrudniejszy dzień"
              value={
                analysis.summary.hardestWeekday === null
                  ? NO_VALUE
                  : WEEKDAYS[analysis.summary.hardestWeekday].full
              }
            />
            {/* A dash, not a guess: below the heat map's threshold there are not
                enough answered "pora dnia" fields to name one, and inventing a
                part of the day here would say what the map itself refuses to. */}
            <SummaryCard
              label="Trudna pora dnia"
              value={
                analysis.summary.hardestTimeOfDay === null
                  ? NO_VALUE
                  : TIME_OF_DAY_LABELS[analysis.summary.hardestTimeOfDay]
              }
            />
          </section>

          <section className="analysis-card">
            <h2>Kiedy jest trudniej</h2>
            <p className="analysis-card-subtitle">Dzień tygodnia i pora dnia</p>
            <EmotionHeatmap heatmap={analysis.heatmap} />
          </section>

          <section className="analysis-card">
            <h2>Udział emocji</h2>
            <p className="analysis-card-subtitle">Liczba dni, w których pojawiła się dana emocja</p>
            <AnalysisBarChart
              rows={emotionBars(analysis)}
              emptyText="Żaden wpis z tego okresu nie ma ocenionej emocji."
            />
          </section>

          {/* The one section with a period of its own. It answers "am I keeping
              this up", which is a question about the long run, while everything
              above answers "what is going on lately" and is capped at
              ANALYSIS_WINDOW_DAYS on purpose. The bucket grows with the range
              (weeks, then months), so the chart is never more than a dozen bars
              and never needs paging. */}
          <section className="analysis-card">
            <h2>Częstotliwość wpisów</h2>
            <p className="analysis-card-subtitle">{frequencySubtitle(selection)}</p>
            <div className="analysis-period" role="group" aria-label="Zakres częstotliwości wpisów">
              {FREQUENCY_PERIODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  // aria-pressed, not aria-current: these are toggles over one
                  // chart, not links to somewhere. Journals' filter chips carry
                  // the visual style; the state is the button's own.
                  aria-pressed={selection.kind === 'rolling' && selection.id === option.id}
                  className={
                    selection.kind === 'rolling' && selection.id === option.id
                      ? 'journals-filter-chip journals-filter-chip-active'
                      : 'journals-filter-chip'
                  }
                  onClick={() => setSelection({ kind: 'rolling', id: option.id })}
                >
                  {option.label}
                </button>
              ))}
              {/* A chip until it is picked, a picker once it is. The years come
                  from the server with the first answer, so before that there is
                  nothing to populate a <select> with — and rendering an empty
                  one would offer a control that cannot be used. */}
              {selection.kind === 'rolling' ? (
                <button
                  type="button"
                  aria-pressed={false}
                  className="journals-filter-chip"
                  onClick={() => setSelection({ kind: 'year', year: today.getFullYear() })}
                >
                  Rok
                </button>
              ) : (
                <label className="analysis-year-picker">
                  <span className="visually-hidden">Rok</span>
                  <select
                    value={selection.year}
                    onChange={(event) =>
                      setSelection({ kind: 'year', year: Number(event.target.value) })
                    }
                  >
                    {/* The current year is always offered even with nothing in
                        it yet: it is the year the patient is living in, and its
                        absence would read as the picker being broken. */}
                    {[...new Set([...yearOptions, selection.year])]
                      .sort((a, b) => b - a)
                      .map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            {selection.kind === 'year' && year.loading && (
              <p className="analysis-empty" role="status" aria-busy="true">
                Wczytywanie roku {selection.year}…
              </p>
            )}
            {selection.kind === 'year' && year.failed && (
              <LoadError
                className="journals-status journals-status-error"
                message={FREQUENCY_LOAD_ERROR}
                onRetry={year.retry}
              />
            )}
            {!(selection.kind === 'year' && (year.loading || year.failed)) && (
              <AnalysisBarChart
                rows={frequencyBars(frequency)}
                compact
                emptyText={
                  selection.kind === 'year'
                    ? `W ${selection.year} roku nie ma jeszcze żadnego wpisu.`
                    : 'Brak wpisów w tym okresie.'
                }
                // An absolute ceiling here, unlike the emotion chart: the bars
                // mean "days out of the stretch", and scaling them against the
                // fullest one would draw three days out of seven as a full column.
                max={Math.max(...frequency.map((bucket) => bucket.length), 1)}
              />
            )}
          </section>

          {/* The mockup's rule: a conclusion rather than one more number, so the
              charts above do not end up meaning nothing to the person reading
              them. What it is willing to claim scales with how much history is
              behind it — see buildInsight in utils/analysis.ts. */}
          <section
            className={
              analysis.insight.tentative
                ? 'analysis-insight analysis-insight-tentative'
                : 'analysis-insight'
            }
          >
            <p className="analysis-insight-label">CO Z TEGO WYNIKA</p>
            <p className="analysis-insight-text">{analysis.insight.text}</p>
          </section>

          <section className="analysis-note-banner">
            <span aria-hidden="true">ⓘ</span>
            <p>
              Analiza podsumowuje tylko to, co sam/sama zapisujesz. Dni bez wpisu nie są liczone
              jako gorsze — po prostu ich tu nie ma.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

export default Analysis
