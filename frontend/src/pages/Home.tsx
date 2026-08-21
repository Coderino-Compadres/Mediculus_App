import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { EMOTION_COLORS } from '../utils/emotions'
import type { EmotionName } from '../utils/emotions'
import type { DayMood, TechniqueSuggestion, TodayEntry } from '../types/dashboard'
import { PLACEHOLDER_ROUTES, ROUTES } from '../routes'
import './home.css'

/**
 * The rest of the project (Login/Register/App/main) is still plain JS/JSX;
 * this screen and ModuleSelect.tsx are the first two written in TypeScript.
 */

// ---- Mock data (no backend yet) -------------------------------------------------

/** Toggle to review the empty vs. saved "Dzisiejszy wpis" widget. */
const MOCK_HAS_TODAY_ENTRY = true

const MOCK_TODAY_ENTRY: TodayEntry = {
  moodLabel: 'Źle',
  emotions: [
    { emotion: 'Lęk', intensity: 7 },
    { emotion: 'Stres', intensity: 6 },
  ],
}

const MOCK_STREAK_DAYS = 6

/** 7 days ending today; keep every date <= today so the chart never shows a future entry. */
const MOCK_WEEK: DayMood[] = [
  { dayLabel: 'Sob', date: '2026-08-15', hasEntry: false },
  { dayLabel: 'Ndz', date: '2026-08-16', hasEntry: true, dominantEmotion: 'Spokój', intensity: 4 },
  { dayLabel: 'Pon', date: '2026-08-17', hasEntry: true, dominantEmotion: 'Spokój', intensity: 3 },
  { dayLabel: 'Wt', date: '2026-08-18', hasEntry: true, dominantEmotion: 'Lęk', intensity: 6 },
  { dayLabel: 'Śr', date: '2026-08-19', hasEntry: false },
  { dayLabel: 'Czw', date: '2026-08-20', hasEntry: true, dominantEmotion: 'Stres', intensity: 7 },
  { dayLabel: 'Pt', date: '2026-08-21', hasEntry: true, dominantEmotion: 'Lęk', intensity: 8 },
]

const MOCK_AVERAGE_STRESS = 6.4
const MOCK_AVERAGE_ENERGY = 4.2
/** Confirmed alarm threshold for "Średni stres" (0-10 scale) — see US-PT-13. */
const STRESS_ALERT_THRESHOLD = 6
/**
 * Drives both the "Średni stres" alarm styling and the crisis banner (US-PT-13),
 * so the two can't disagree. A real build computes this from the backend's stress
 * and extreme-emotion averages instead of MOCK_AVERAGE_STRESS.
 */
const isStressAlert = MOCK_AVERAGE_STRESS >= STRESS_ALERT_THRESHOLD

const MOCK_TECHNIQUE: TechniqueSuggestion = {
  name: 'Uziemienie 5-4-3-2-1',
  matchReason: 'Dopasowane do Twoich ostatnich wpisów — dominuje lęk.',
}

// TODO: fill in the real support line number before this ships; until then the
// banner below omits the phone sentence rather than showing a fake number to
// someone in crisis.
const CRISIS_SUPPORT_PHONE = ''

// ---- Menu --------------------------------------------------------------------

/** Reuses the placeholder page's own title as the menu label, so a rename only touches routes.ts. */
function placeholderLabel(path: string): string {
  return PLACEHOLDER_ROUTES.find((route) => route.path === path)?.title ?? path
}

const MENU_ITEMS: { label: string; to: string }[] = [
  { label: placeholderLabel(ROUTES.journals), to: ROUTES.journals },
  { label: placeholderLabel(ROUTES.reports), to: ROUTES.reports },
  { label: placeholderLabel(ROUTES.analysis), to: ROUTES.analysis },
  { label: placeholderLabel(ROUTES.techniques), to: ROUTES.techniques },
  { label: placeholderLabel(ROUTES.profile), to: ROUTES.profile },
  // TODO: not in the mockup, but confirmed as a high-priority feature (US-PT-13)
  // — added as a plain menu entry for now, no escalation logic yet.
  { label: placeholderLabel(ROUTES.safetyPlan), to: ROUTES.safetyPlan },
  { label: 'Przejdź do części dietetyczno-psychodietetycznej', to: ROUTES.diet },
]

function HeaderMenu() {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    setOpen(false)
    try {
      await signOut()
    } catch {
      // Local session is cleared either way (see AuthProvider.signOut); a failed
      // logout request still has to land the user back on /login.
    } finally {
      navigate(ROUTES.login, { replace: true })
    }
  }

  return (
    <div className="home-menu">
      <button
        type="button"
        className="home-menu-toggle"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <>
          <div className="home-menu-backdrop" onClick={() => setOpen(false)} />
          <nav className="home-menu-dropdown">
            {user?.email && (
              <div className="home-menu-account">
                <p className="home-menu-account-email">{user.email}</p>
                {user.role && <p className="home-menu-account-role">{user.role}</p>}
              </div>
            )}
            {MENU_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <button type="button" className="home-menu-signout" onClick={() => void onSignOut()}>
              Wyloguj
            </button>
          </nav>
        </>
      )}
    </div>
  )
}

// ---- Today's entry widget ------------------------------------------------------

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

  const summary = entry.emotions.map((e) => `${e.emotion} ${e.intensity}/10`).join(', ')

  return (
    <div className="today-card">
      <div className="today-card-header">
        <h2>Dzisiejszy wpis</h2>
        <span className="today-badge">Zapisany</span>
      </div>
      <p className="today-summary">
        {entry.moodLabel} — {summary}
      </p>
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
const INTENSITY_TO_HEIGHT_SCALE = 10

function MoodChart({ week }: { week: DayMood[] }) {
  const usedEmotions = Array.from(
    new Set(
      week
        .map((d) => d.dominantEmotion)
        .filter((emotion): emotion is EmotionName => emotion !== undefined),
    ),
  )

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
          const hasEntry = day.hasEntry && day.intensity !== undefined && day.dominantEmotion !== undefined
          const heightPct = hasEntry
            ? Math.max(MIN_BAR_HEIGHT_PCT, (day.intensity as number) * INTENSITY_TO_HEIGHT_SCALE)
            : NO_ENTRY_BAR_HEIGHT_PCT
          const color = hasEntry && day.dominantEmotion ? EMOTION_COLORS[day.dominantEmotion] : undefined
          const title = hasEntry
            ? `${day.dayLabel}: ${day.dominantEmotion} ${day.intensity}/10`
            : `${day.dayLabel}: brak wpisu`

          return (
            <div className="mood-chart-column" key={day.date}>
              <div className="mood-chart-track">
                <div
                  className={hasEntry ? 'mood-chart-bar' : 'mood-chart-bar mood-chart-bar-empty'}
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
        <span className="mood-chart-legend-item">
          <span className="mood-chart-legend-dot mood-chart-legend-dot-empty" />
          Brak wpisu
        </span>
      </div>
    </div>
  )
}

// ---- Page ------------------------------------------------------------------------

function Home() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''
  const today = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })

  return (
    <div className="home-page">
      <header className="home-header">
        <div>
          <p className="home-module-label">PSYCHOTERAPIA</p>
          <h1>Strona główna</h1>
        </div>
        <HeaderMenu />
      </header>

      <section className="home-welcome">
        <div>
          <p className="home-welcome-greeting">{firstName ? `Dobry dzień, ${firstName}` : 'Dobry dzień'}</p>
          <p className="home-welcome-date">{today}</p>
        </div>
        <div className="home-streak">
          <span className="home-streak-count">{MOCK_STREAK_DAYS}</span>
          <span className="home-streak-label">dni z rzędu</span>
        </div>
      </section>

      <TodayEntryWidget entry={MOCK_HAS_TODAY_ENTRY ? MOCK_TODAY_ENTRY : null} />

      <MoodChart week={MOCK_WEEK} />

      <section className="home-stats">
        <div className={isStressAlert ? 'home-stat-card home-stat-card-alert' : 'home-stat-card'}>
          <p className="home-stat-label">Średni stres</p>
          <p className="home-stat-value">{MOCK_AVERAGE_STRESS.toFixed(1).replace('.', ',')}/10</p>
        </div>
        <div className="home-stat-card">
          <p className="home-stat-label">Średnia energia</p>
          <p className="home-stat-value">{MOCK_AVERAGE_ENERGY.toFixed(1).replace('.', ',')}/10</p>
        </div>
      </section>

      {isStressAlert && (
        <section className="home-crisis-banner">
          <p>
            Zauważyliśmy, że ostatnio jest Ci trudniej.{' '}
            {CRISIS_SUPPORT_PHONE
              ? `Możesz zadzwonić pod numer wsparcia ${CRISIS_SUPPORT_PHONE} albo przejść do swojego planu bezpieczeństwa.`
              : 'Możesz przejść do swojego planu bezpieczeństwa.'}
          </p>
          <Link to={ROUTES.safetyPlan} className="home-crisis-link">
            Plan bezpieczeństwa →
          </Link>
        </section>
      )}

      <Link to={ROUTES.techniques} className="home-technique-card">
        <div>
          <p className="home-technique-label">Propozycja na dziś: {MOCK_TECHNIQUE.name}</p>
          <p className="home-technique-reason">{MOCK_TECHNIQUE.matchReason}</p>
        </div>
        <span className="home-technique-arrow">→</span>
      </Link>

      <section className="home-disclaimer">
        <span className="home-disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <p>
          Aplikacja wspiera Cię w codziennym monitorowaniu emocji, ale nie zastępuje pomocy specjalisty.
          W sytuacji kryzysowej skontaktuj się z lekarzem, terapeutą lub telefonem zaufania.
        </p>
      </section>
    </div>
  )
}

export default Home
