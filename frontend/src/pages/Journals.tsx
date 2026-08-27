import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import { fetchJournalEntries } from '../api/diary'
import { toIsoDate } from '../utils/days'
import { MOOD_OPTIONS, MOOD_RANK } from '../utils/moods'
import { placeLabel } from '../utils/triggers'
import type { JournalListEntry } from '../types/diaryEntry'
import { ROUTES, journalDetailPath } from '../routes'
import './journals.css'

const LOAD_ERROR = 'Nie udało się wczytać dzienniczków. Spróbuj ponownie.'

type DayFilter = 'all' | 'hard' | 'good'

const FILTERS: { value: DayFilter; label: string }[] = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'hard', label: 'Trudniejsze dni' },
  { value: 'good', label: 'Dobre dni' },
]

function matchesFilter(entry: JournalListEntry, filter: DayFilter): boolean {
  if (filter === 'all') return true
  const rank = entry.mood ? MOOD_RANK[entry.mood] : null
  if (rank === null) return false
  return filter === 'hard' ? rank <= 2 : rank >= 4
}

/** Trimmed to a single line — the "Sytuacja" field if there is one, else the free notes. */
function previewText(entry: JournalListEntry): string {
  const source = entry.situationReaction.situation.trim() || entry.notes.trim()
  if (!source) return 'Brak notatki.'
  return source.length > 90 ? `${source.slice(0, 90).trimEnd()}…` : source
}

/** Up to 2 strongest emotions, then the place/trigger — matches the mockup's "Lęk 7", "Praca" style. */
function summaryChips(entry: JournalListEntry): string[] {
  const emotionChips = [...entry.emotions]
    .sort((a, b) => (b.intensity ?? -1) - (a.intensity ?? -1))
    .slice(0, 2)
    .map((rating) => (rating.intensity === null ? rating.emotion : `${rating.emotion} ${rating.intensity}`))

  const place = placeLabel(entry.situationReaction)

  return place ? [...emotionChips, place] : emotionChips
}

/** The mood as a colour and nothing else.
 *
 * The dot carries no text, so `role="img"` plus the label is what keeps the
 * mood readable to a screen reader — without them it would be an empty span
 * that assistive tech skips entirely. An entry with no mood gets an outline
 * rather than a fill, so "not answered" still looks different from "answered".
 */
function moodBadge(entry: JournalListEntry) {
  const option = entry.mood ? MOOD_OPTIONS.find((item) => item.value === entry.mood) : undefined
  return (
    <span
      className={option ? 'journal-mood-badge' : 'journal-mood-badge journal-mood-badge-empty'}
      style={option ? { backgroundColor: option.color } : undefined}
      role="img"
      aria-label={option ? option.label : 'Brak nastroju'}
    />
  )
}

function JournalRow({ entry, isToday, onOpen }: { entry: JournalListEntry; isToday: boolean; onOpen: () => void }) {
  const dateLabel = useMemo(
    () => new Date(`${entry.date}T00:00:00`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }),
    [entry.date],
  )
  const chips = summaryChips(entry)

  return (
    <button type="button" className="journal-row" onClick={onOpen}>
      {moodBadge(entry)}
      <div className="journal-row-body">
        <div className="journal-row-top">
          <span className="journal-row-date">{dateLabel}</span>
          {!isToday && <span className="journal-readonly-badge">Tylko odczyt</span>}
        </div>
        <p className="journal-row-preview">{previewText(entry)}</p>
        {chips.length > 0 && (
          <div className="journal-row-chips">
            {chips.map((chip) => (
              <span key={chip} className="journal-row-chip">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="journal-row-arrow" aria-hidden="true">
        →
      </span>
    </button>
  )
}

function Journals() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const todayIso = useMemo(() => toIsoDate(today), [today])
  const [filter, setFilter] = useState<DayFilter>('all')
  const [entries, setEntries] = useState<JournalListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by the retry button; the effect below lists it as a dependency, so
  // trying again re-runs the one load rather than a second copy of it.
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)

  // GET /api/diary/ answers with every entry this patient has written, newest
  // first — today included. A patient who has never written one gets an empty
  // list, which is a normal state here rather than an error.
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

  const filteredEntries = entries.filter((entry) => matchesFilter(entry, filter))

  function openEntry(entry: JournalListEntry) {
    if (entry.date === todayIso) {
      navigate(ROUTES.diaryEntry)
    } else {
      navigate(journalDetailPath(entry.id))
    }
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Dzienniczki</h1>
        </div>
        <HeaderMenu />
      </header>

      <div className="journals-filters" role="group" aria-label="Filtruj wpisy">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? 'journals-filter-chip journals-filter-chip-active' : 'journals-filter-chip'}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="journals-status" role="status" aria-busy="true">
          Wczytywanie dzienniczków…
        </div>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && (
        <div className="journals-list">
          {filteredEntries.length === 0 && (
            <p className="journals-empty">
              {entries.length === 0
                ? 'Nie masz jeszcze żadnych wpisów.'
                : 'Brak wpisów odpowiadających temu filtrowi.'}
            </p>
          )}
          {filteredEntries.map((entry) => (
            <JournalRow
              key={entry.id}
              entry={entry}
              isToday={entry.date === todayIso}
              onOpen={() => openEntry(entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Journals
