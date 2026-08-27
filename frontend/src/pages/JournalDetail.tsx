import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import { fetchJournalEntry } from '../api/diary'
import { EMOTION_COLORS, STRES, type EmotionName } from '../utils/emotions'
import { MOOD_OPTIONS } from '../utils/moods'
import { placeLabel } from '../utils/triggers'
import type { JournalListEntry } from '../types/diaryEntry'
import { ROUTES } from '../routes'
import './diaryEntry.css'
import './journals.css'
import './journalDetail.css'

/** Matches the alert threshold used in DiaryEntry.tsx for the 'Stres' emotion (US-PT-13). */
const STRESS_ALERT_THRESHOLD = 6
const EMOTION_ALERTS: Partial<Record<EmotionName, number>> = { [STRES]: STRESS_ALERT_THRESHOLD }

const LOAD_ERROR = 'Nie udało się wczytać tego wpisu. Spróbuj ponownie.'

interface ReadOnlyLevelProps {
  label: string
  lowLabel: string
  highLabel: string
  value: number | null
}

function ReadOnlyLevel({ label, lowLabel, highLabel, value }: ReadOnlyLevelProps) {
  return (
    <div className="journal-level">
      <div className="journal-level-header">
        <span className="journal-level-label">{label}</span>
        <span className="journal-level-value">{value ?? '—'}/10</span>
      </div>
      <div className="journal-level-track">
        <div className="journal-level-fill" style={{ width: `${((value ?? 0) / 10) * 100}%` }} />
      </div>
      <div className="journal-level-ends">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  )
}

function JournalDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<JournalListEntry | null>(null)
  // Starts false when the route gave us no id: there is nothing to wait for, so
  // deriving it here beats setting it from inside the effect.
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by the retry button; the effect below lists it as a dependency, so
  // trying again re-runs the one load rather than a second copy of it.
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)

  // A 404 means "no such entry for this patient" and covers both a wrong id and
  // somebody else's — the backend does not tell them apart, so neither does the
  // wording here.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetchJournalEntry(id)
      .then((loaded) => {
        if (cancelled) return
        setEntry(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const notFound = cause instanceof ApiError && cause.status === 404
        setEntry(null)
        setLoadError(notFound ? null : (cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
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
      <div className="journal-detail-page">
        <p className="journal-detail-status" role="status" aria-busy="true">
          Wczytywanie wpisu…
        </p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="journal-detail-page">
        <LoadError
          className="journal-detail-status journal-detail-status-error"
          message={loadError}
          onRetry={retry}
        />
        <Link to={ROUTES.journals}>← Wróć do Dzienniczków</Link>
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="journal-detail-page">
        <p className="journal-detail-not-found">Nie znaleziono tego wpisu.</p>
        <Link to={ROUTES.journals}>← Wróć do Dzienniczków</Link>
      </div>
    )
  }

  const moodOption = entry.mood ? MOOD_OPTIONS.find((option) => option.value === entry.mood) : undefined
  const dateLabel = new Date(`${entry.date}T00:00:00`).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const savedAtLabel = new Date(entry.savedAt).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const place = placeLabel(entry.situationReaction)

  return (
    <div className="journal-detail-page">
      <header className="journal-detail-header">
        <button
          type="button"
          className="journal-detail-back"
          aria-label="Wróć do Dzienniczków"
          onClick={() => navigate(ROUTES.journals)}
        >
          ←
        </button>
        <div className="journal-detail-header-titles">
          <p className="journal-detail-module-label">PSYCHOTERAPIA</p>
          <h1>Dzienniczek</h1>
          <p className="journal-detail-date">
            {dateLabel} · zapisano {savedAtLabel}
          </p>
        </div>
        <HeaderMenu />
      </header>

      <div className="journal-detail-readonly-row">
        <span className="journal-readonly-badge">Tylko odczyt</span>
      </div>

      <section className="journal-detail-info-banner">
        <span className="journal-detail-info-icon" aria-hidden="true">
        </span>
        <p>
          Wpis z przeszłości — tylko do odczytu. Edytować możesz wyłącznie dzisiejszy dzienniczek. Historia
          wpisów pozostaje niezmienna, żeby dane w ewentualnym raporcie dla terapeuty były wiarygodne.
        </p>
      </section>

      <section className="journal-detail-card">
        <h2>Nastrój i emocje</h2>
        {moodOption ? (
          <p className="journal-mood-line">
            <span className="journal-mood-dot" style={{ backgroundColor: moodOption.color }} />
            {moodOption.label}
          </p>
        ) : (
          <p className="journal-mood-line-empty">Nastrój nie został zapisany.</p>
        )}

        {entry.emotions.length > 0 ? (
          <div className="journal-emotion-list">
            {entry.emotions.map((rating) => {
              const threshold = EMOTION_ALERTS[rating.emotion]
              const isAlert = threshold !== undefined && (rating.intensity ?? 0) >= threshold
              return (
                <div className="journal-emotion-row" key={rating.emotion}>
                  <span style={{ color: EMOTION_COLORS[rating.emotion] }}>{rating.emotion}</span>
                  <span className={isAlert ? 'journal-emotion-value journal-emotion-value-alert' : 'journal-emotion-value'}>
                    {rating.intensity === null ? 'bez oceny' : `${rating.intensity}/10`}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="journal-mood-line-empty">Brak wybranych emocji.</p>
        )}
      </section>

      <section className="journal-detail-card">
        <h2>Poziomy i samopoczucie</h2>
        <ReadOnlyLevel label="Poziom energii" lowLabel="wyczerpanie" highLabel="pełnia energii" value={entry.energyLevel} />
        <ReadOnlyLevel
          label="Poziom napięcia"
          lowLabel="rozluźnienie"
          highLabel="skrajne napięcie"
          value={entry.tensionLevel}
        />
      </section>

      <section className="journal-detail-card">
        <h2>Sytuacja i reakcja</h2>
        {place && <p className="journal-detail-place">Miejsce: {place}</p>}

        <div className="journal-detail-field">
          <span className="journal-detail-field-label">Sytuacja</span>
          <p>{entry.situationReaction.situation || '—'}</p>
        </div>
        <div className="journal-detail-field">
          <span className="journal-detail-field-label">Emocja</span>
          <p>{entry.situationReaction.emotionNote || '—'}</p>
        </div>
        <div className="journal-detail-field">
          <span className="journal-detail-field-label">Myśl</span>
          <p>{entry.situationReaction.thought || '—'}</p>
        </div>
        <div className="journal-detail-field">
          <span className="journal-detail-field-label">Zachowanie</span>
          <p>{entry.situationReaction.behavior || '—'}</p>
        </div>
      </section>

      <section className="journal-detail-card">
        <h2>Własne notatki</h2>
        <p>{entry.notes || 'Brak notatek.'}</p>
      </section>

      {entry.hasRiskyBehavior && (
        <section className="journal-detail-card">
          <span className="risky-behavior-toggle risky-behavior-toggle-active">
            <span className="risky-behavior-icon" aria-hidden="true">
              !
            </span>
            Oznaczone zachowanie ryzykowne
          </span>
          {entry.riskyBehaviorNote && <p className="journal-detail-risky-note">{entry.riskyBehaviorNote}</p>}
        </section>
      )}
    </div>
  )
}

export default JournalDetail
