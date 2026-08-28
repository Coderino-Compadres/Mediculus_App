import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AnalysisBarChart, { type BarRow } from '../components/AnalysisBarChart'
import EmotionHeatmap from '../components/EmotionHeatmap'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import MoodStressChart from '../components/MoodStressChart'
import { ApiError } from '../api/client'
import { fetchJournalEntries } from '../api/diary'
import {
  ANALYSIS_WINDOW_DAYS,
  MOOD_SCALE_MAX,
  WEEKDAYS,
  buildAnalysis,
  daysGenitive,
  entriesGenitive,
  sageShade,
} from '../utils/analysis'
import { formatNumber, pluralDays } from '../utils/reports'
import { TIME_OF_DAY_LABELS } from '../utils/timeOfDay'
import type { Analysis as AnalysisData } from '../types/analysis'
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

function weekBars(analysis: AnalysisData): BarRow[] {
  const longest = Math.max(...analysis.weeks.map((week) => week.length), 1)
  return analysis.weeks.map((week) => ({
    key: week.label,
    label: week.label,
    value: week.days,
    // Deeper sage the fuller the week — one hue, so the bars read as a series
    // rather than as categories that mean something different from one another.
    color: sageShade(week.days / longest),
    title: `${week.label} (${week.rangeLabel}): ${week.days} z ${week.length} ${daysGenitive(week.length)} z wpisem`,
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

          <MoodStressChart points={analysis.trend} days={analysis.trend.length} />

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

          <section className="analysis-card">
            <h2>Częstotliwość wpisów</h2>
            <p className="analysis-card-subtitle">Dni z wpisem w tygodniu</p>
            <AnalysisBarChart
              rows={weekBars(analysis)}
              emptyText="Brak wpisów w tym okresie."
              // An absolute ceiling here, unlike the emotion chart: the bars mean
              // "days out of seven", and scaling them against the best week would
              // draw three days as a full column.
              max={Math.max(...analysis.weeks.map((week) => week.length), 1)}
            />
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
