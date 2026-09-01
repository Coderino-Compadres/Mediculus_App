import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { ApiError } from '../api/client'
import { fetchHomeDashboard } from '../api/dashboard'
import { EMOTION_COLORS } from '../utils/emotions'
import { crisisSupportLine } from '../data/crisisLines'
import { APP_DISCLAIMER } from '../utils/disclaimer'
import PhoneLink from '../components/PhoneLink'
import type { DayMood, HomeDashboard, TechniqueSuggestion, TodayEntry } from '../types/dashboard'
import { ROUTES } from '../routes'
import HeaderMenu from '../components/HeaderMenu'
import './home.css'

/**
 * The rest of the project (Login/Register/App/main) is still plain JS/JSX;
 * this screen and ModuleSelect.tsx are the first two written in TypeScript.
 *
 * Everything below the greeting comes from GET /api/dashboard/home/, which
 * aggregates the signed-in patient's own diary entries — see core/dashboard.py.
 */

/** Confirmed alarm threshold for "Średni stres" (0-10 scale) — see US-PT-13. */
const STRESS_ALERT_THRESHOLD = 6

/**
 * The banner's support number comes from `crisisSupportLine()` in
 * `data/crisisLines.ts` — the same file "Plan bezpieczeństwa" lists, so the two
 * screens cannot end up naming different numbers. It is chosen by the reader's
 * age, because none of the published lines is age-neutral; see that file.
 *
 * There used to be a local `CRISIS_SUPPORT_PHONE = ''` here with a TODO to fill
 * in later. Filling it in locally would have given the app two independent
 * copies of a crisis number, which survives exactly one correction before one of
 * them is stale — and a stale crisis number is the worst thing this screen could
 * show.
 */

const DASHBOARD_ERROR = 'Nie udało się wczytać Twoich danych. Spróbuj ponownie.'

/** Polish decimal comma; '—' when the week holds nothing to average. */
function formatScore(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1).replace('.', ',')}/10`
}

// ---- Today's entry widget ------------------------------------------------------

/** "Neutralny — Lęk 7/10, Stres 6/10", skipping whichever half the entry left blank. */
function todaySummary(entry: TodayEntry): string {
  const emotions = entry.emotions
    .map((rating) => (rating.intensity === null ? rating.emotion : `${rating.emotion} ${rating.intensity}/10`))
    .join(', ')
  return [entry.moodLabel, emotions].filter(Boolean).join(' — ') || 'Wpis zapisany.'
}

function TodayEntryWidget({ entry }: { entry: TodayEntry | null }) {
  const navigate = useNavigate()

  if (!entry) {
    return (
      <div className="today-card today-card-empty">
        <h2>Jeszcze pusty</h2>
        <p>
          Dzienniczek zeruje się o północy, a poprzednie dni trafiają do Twojego profilu. Zapisz, jak
          masz się dzisiaj.
        </p>
        <button type="button" className="today-add-button" onClick={() => navigate(ROUTES.diaryEntry)}>
          Dodaj wpis
        </button>
      </div>
    )
  }

  return (
    <div className="today-card">
      <div className="today-card-header">
        <h2>Dzisiejszy wpis</h2>
        <span className="today-badge">Zapisany</span>
      </div>
      <p className="today-summary">{todaySummary(entry)}</p>
      {/* Edit is only allowed for the same calendar day, until midnight; after that
          the entry is locked. Real enforcement arrives with the backend. */}
      <div className="today-actions">
        <button type="button" className="today-secondary-button" onClick={() => navigate(ROUTES.diaryEntry)}>
          Edytuj
        </button>
        <button type="button" className="today-secondary-button" onClick={() => navigate(ROUTES.techniques)}>
          Techniki
        </button>
      </div>
    </div>
  )
}

// ---- 7-day mood chart ----------------------------------------------------------

/** Below the real-data floor (MIN_BAR_HEIGHT_PCT), so a missing day never looks "worse" than a calm logged one. */
const NO_ENTRY_BAR_HEIGHT_PCT = 6
const MIN_BAR_HEIGHT_PCT = 8
/** A day that was written but rated nothing: a fixed height, because there is no value to draw. */
const UNRATED_BAR_HEIGHT_PCT = 20
const INTENSITY_TO_HEIGHT_SCALE = 10
/** Written, but the emotion is not one of the ten with a colour of their own. */
const UNRATED_BAR_COLOR = '#b9c0c9'
const UNRATED_LEGEND_LABEL = 'Inna emocja'

/**
 * A named emotion with no intensity is normal, not a gap: 'Spokój' and 'Wstyd'
 * have no scale column of their own, so an entry can say which feeling was
 * strongest without saying how strong. The tooltip says so rather than implying
 * the whole entry went unrated.
 */
function dayTitle(day: DayMood, intensity: number | null): string {
  if (!day.hasEntry) return `${day.dayLabel}: brak wpisu`
  if (!day.dominantEmotion) return `${day.dayLabel}: wpis bez oceny nastroju`
  if (intensity === null) return `${day.dayLabel}: ${day.dominantEmotion}, bez oceny natężenia`
  return `${day.dayLabel}: ${day.dominantEmotion} ${intensity}/10`
}

function MoodChart({ week }: { week: DayMood[] }) {
  const usedEmotions = Array.from(
    new Set(week.map((day) => day.dominantEmotion).filter((emotion) => emotion !== null)),
  )
  const hasUnnamedEntry = week.some((day) => day.hasEntry && day.dominantEmotion === null)

  return (
    <div className="mood-chart-card">
      <div className="mood-chart-title-row">
        <h2>Nastrój, ostatnie 7 dni</h2>
        <Link to={ROUTES.analysis} className="mood-chart-link">
          Analiza →
        </Link>
      </div>

      <div className="mood-chart-bars">
        {week.map((day) => {
          const intensity = day.hasEntry ? day.intensity : null
          const heightPct =
            intensity !== null
              ? Math.max(MIN_BAR_HEIGHT_PCT, intensity * INTENSITY_TO_HEIGHT_SCALE)
              : day.hasEntry
                ? UNRATED_BAR_HEIGHT_PCT
                : NO_ENTRY_BAR_HEIGHT_PCT
          const color = day.dominantEmotion
            ? EMOTION_COLORS[day.dominantEmotion]
            : day.hasEntry
              ? UNRATED_BAR_COLOR
              : undefined
          const title = dayTitle(day, intensity)

          return (
            <div className="mood-chart-column" key={day.date}>
              <div className="mood-chart-track">
                <div
                  className={day.hasEntry ? 'mood-chart-bar' : 'mood-chart-bar mood-chart-bar-empty'}
                  style={{ height: `${heightPct}%`, backgroundColor: color }}
                  title={title}
                />
              </div>
              <span className="mood-chart-day-label">{day.dayLabel}</span>
            </div>
          )
        })}
      </div>

      <div className="mood-chart-legend">
        {usedEmotions.map((emotion) => (
          <span className="mood-chart-legend-item" key={emotion}>
            <span
              className="mood-chart-legend-dot"
              style={{ backgroundColor: EMOTION_COLORS[emotion] }}
            />
            {emotion}
          </span>
        ))}
        {hasUnnamedEntry && (
          <span className="mood-chart-legend-item">
            <span className="mood-chart-legend-dot" style={{ backgroundColor: UNRATED_BAR_COLOR }} />
            {UNRATED_LEGEND_LABEL}
          </span>
        )}
        <span className="mood-chart-legend-item">
          <span className="mood-chart-legend-dot mood-chart-legend-dot-empty" />
          Brak wpisu
        </span>
      </div>
    </div>
  )
}

// ---- Technique suggestion --------------------------------------------------------

function TechniqueCard({ technique }: { technique: TechniqueSuggestion }) {
  // TODO: the card names a technique and links to the catalogue, but the two
  // cannot meet yet. The suggestion is read out of `raport` (core/dashboard.py),
  // which nothing writes — so the only names it ever carries are the seeded ones
  // ('Body scan', 'Dziennik emocji', 'Technika 5-4-3-2-1'), and none of them is
  // in the catalogue, whose content comes from the client's DBT materials. So
  // tapping a named suggestion lands on a list of eleven other techniques.
  // Deliberately not papered over with a name→slug mapping here: the fix is for
  // `raport` to reference a technique by id once something writes it (see the
  // "still to do" list in CLAUDE.md), or for this card to stop being a link.
  // Left as it is because the card is explicitly staying on mock data for now.
  return (
    <Link to={ROUTES.techniques} className="home-technique-card">
      <div>
        <p className="home-technique-label">Propozycja na dziś: {technique.name}</p>
        <p className="home-technique-reason">{technique.matchReason}</p>
      </div>
      <span className="home-technique-arrow">→</span>
    </Link>
  )
}

// ---- Page ------------------------------------------------------------------------

interface DashboardError {
  message: string
  /** A refused request (no patient profile) will be refused again — don't offer a retry. */
  canRetry: boolean
}

function Home() {
  /**
   * Whether we arrived here straight after saving a diary entry.
   *
   * The confirmation belongs on this screen rather than on the form: saving
   * navigates away, so a message rendered there would show for a single frame.
   * Read from the navigation's own state, which means it survives the redirect
   * and disappears on the next one — a reload of /home carries no state and
   * shows nothing, which is right, because by then it is not news.
   */
  const savedEntry = Boolean(
    (useLocation().state as { savedEntry?: boolean } | null)?.savedEntry,
  )
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''
  // Which support line the banner names. Minors have accounts here, and the two
  // adult lines are published as adult lines — so this is not a personalisation,
  // it is the difference between a number somebody can call and one that will
  // turn them away.
  const supportLine = crisisSupportLine(user?.isChild ?? null)
  const today = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })

  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<DashboardError | null>(null)
  /** Bumped by the retry button; re-runs the effect without duplicating the request logic. */
  const [reloadKey, setReloadKey] = useState(0)

  // The retry button owns the "loading again" state: setting it inside the
  // effect would start a second render pass on every mount for nothing.
  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setReloadKey((key) => key + 1)
  }, [])

  useEffect(() => {
    let active = true

    fetchHomeDashboard()
      .then((data) => {
        if (!active) return
        setDashboard(data)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        const isApiError = cause instanceof ApiError
        setDashboard(null)
        setError({
          message: (isApiError && cause.formMessage) || DASHBOARD_ERROR,
          canRetry: !isApiError || cause.status !== 403,
        })
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const averageStress = dashboard?.averageStress ?? null
  // Drives both the "Średni stres" alarm styling and the crisis banner (US-PT-13),
  // so the two cannot disagree.
  const isStressAlert = averageStress !== null && averageStress >= STRESS_ALERT_THRESHOLD

  return (
    <div className="home-page">
      {savedEntry && (
        <p className="home-saved-notice" role="status">
          Zapisano dzisiejszy wpis.
        </p>
      )}
      <header className="home-header">
        <div>
          <p className="home-module-label">PSYCHOTERAPIA</p>
          <h1>Strona główna</h1>
        </div>
        <HeaderMenu />
      </header>

      <section className="home-welcome">
        <div>
          <p className="home-welcome-greeting">{firstName ? `Dzień dobry, ${firstName}` : 'Dzień dobry'}</p>
          <p className="home-welcome-date">{today}</p>
        </div>
        {dashboard && (
          <div className="home-streak">
            <span className="home-streak-count">{dashboard.streakDays}</span>
            <span className="home-streak-label">dni z rzędu</span>
          </div>
        )}
      </section>

      {loading && <div className="home-loading" role="status" aria-busy="true">Wczytywanie Twoich danych…</div>}

      {!loading && error && (
        <div className="home-error" role="alert">
          <p>{error.message}</p>
          {error.canRetry && (
            <button type="button" className="today-secondary-button" onClick={retry}>
              Spróbuj ponownie
            </button>
          )}
        </div>
      )}

      {!loading && dashboard && (
        <>
          <TodayEntryWidget entry={dashboard.todayEntry} />

          <MoodChart week={dashboard.week} />

          <section className="home-stats">
            <div className={isStressAlert ? 'home-stat-card home-stat-card-alert' : 'home-stat-card'}>
              <p className="home-stat-label">Średni stres</p>
              <p className="home-stat-value">{formatScore(dashboard.averageStress)}</p>
            </div>
            <div className="home-stat-card">
              <p className="home-stat-label">Średnia energia</p>
              <p className="home-stat-value">{formatScore(dashboard.averageEnergy)}</p>
            </div>
          </section>

          {isStressAlert && (
            <section className="home-crisis-banner">
              <p>
                Zauważyliśmy, że ostatnio jest Ci trudniej. Możesz zadzwonić pod numer wsparcia{' '}
                {/* The shared PhoneLink, not a bare anchor: it dials on one tap
                    and it names the line in its accessible label. That matters
                    more here than anywhere else on the screen — tabbing into a
                    bare number link, the only thing announced is nine digits. */}
                <PhoneLink
                  phone={supportLine.number}
                  label={supportLine.name}
                  className="home-crisis-phone"
                />{' '}
                albo przejść do swojego planu bezpieczeństwa.
              </p>
              <Link to={ROUTES.safetyPlan} className="home-crisis-link">
                Plan bezpieczeństwa →
              </Link>
            </section>
          )}

          {dashboard.technique && <TechniqueCard technique={dashboard.technique} />}
        </>
      )}

      <section className="home-disclaimer">
        <span className="home-disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        {/* One shared constant — the safety plan repeats this sentence and the
            two must not drift apart. See utils/disclaimer.ts. */}
        <p>{APP_DISCLAIMER}</p>
      </section>
    </div>
  )
}

export default Home
