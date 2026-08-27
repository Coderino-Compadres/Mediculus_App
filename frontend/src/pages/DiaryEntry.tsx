import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import MoodPicker from '../components/MoodPicker'
import EmotionSelector from '../components/EmotionSelector'
import LevelSlider from '../components/LevelSlider'
import { ApiError } from '../api/client'
import { fetchTodayEntry, saveTodayEntry } from '../api/diary'
import { toIsoDate } from '../utils/days'
import { STRES, type EmotionName } from '../utils/emotions'
import { OTHER_TRIGGER, TRIGGER_OPTIONS } from '../utils/triggers'
import type { DiaryEntryDraft, EmotionEntry } from '../types/diaryEntry'
import { ROUTES } from '../routes'
import './diaryEntry.css'

/** Matches the alert threshold used on Home for "Średni stres" (US-PT-13).
 *
 * It sits on the 'Stres' chip rather than on a slider of its own: stress is one
 * of the ten emotions, rated on the emotion picker like the other nine, and
 * `diary.stress_level` stores exactly that number. */
const STRESS_ALERT_THRESHOLD = 6
const EMOTION_ALERTS: Partial<Record<EmotionName, number>> = { [STRES]: STRESS_ALERT_THRESHOLD }

const LOAD_ERROR = 'Nie udało się wczytać dzisiejszego wpisu. Spróbuj ponownie.'
const SAVE_ERROR = 'Nie udało się zapisać wpisu. Spróbuj ponownie.'
const LEAVE_CONFIRM =
  'Masz niezapisane zmiany w dzisiejszym wpisie. Jeśli wyjdziesz teraz, przepadną.'

const RISKY_NOTE_REQUIRED = 'Opisz krótko, co się wydarzyło — inaczej nie zapiszemy oznaczenia.'

function emptyDraft(isoDate: string): DiaryEntryDraft {
  return {
    date: isoDate,
    mood: null,
    emotions: [],
    energyLevel: 0,
    tensionLevel: 0,
    situationReaction: {
      trigger: null,
      triggerOther: '',
      situation: '',
      emotionNote: '',
      thought: '',
      behavior: '',
    },
    notes: '',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
  }
}

function DiaryEntry() {
  const navigate = useNavigate()

  const today = useMemo(() => new Date(), [])
  const isoDate = useMemo(() => toIsoDate(today), [today])
  const dateLabel = useMemo(
    () => today.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }),
    [today],
  )

  const [draft, setDraft] = useState<DiaryEntryDraft>(() => emptyDraft(isoDate))
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [riskyNoteError, setRiskyNoteError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  /**
   * What was on screen when the form was last in step with the server.
   *
   * Compared by value rather than tracked with a flag, so typing something and
   * deleting it again does not count as a change — the question this answers is
   * "would leaving lose anything", not "did anything happen".
   */
  const [saved, setSaved] = useState<DiaryEntryDraft | null>(null)
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  /**
   * Warns before a reload, a closed tab or the back button leaves the page.
   *
   * Only covers navigation the browser owns. Leaving through the header menu or
   * this screen's own back arrow is in-app routing, which `<Routes>` cannot
   * intercept without a data router — the back arrow asks on its own (see
   * `leave`), a menu link still does not. A form with eight fields losing
   * everything in silence was worth the partial fix.
   */
  useEffect(() => {
    if (!dirty) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function leave() {
    if (dirty && !window.confirm(LEAVE_CONFIRM)) return
    navigate(ROUTES.home)
  }

  // GET /api/diary/today/ answers with null until the first save of the day, so
  // "no entry yet" is the normal case here rather than an error.
  useEffect(() => {
    let cancelled = false

    fetchTodayEntry()
      .then((entry) => {
        if (cancelled) return
        if (entry !== null) {
          setDraft(entry)
          setIsEditing(true)
          // An entry that already has details worth seeing should not hide them.
          setDetailsOpen(true)
        }
        // The baseline the guard compares against. Set only once the load has
        // answered: before that there is nothing on screen worth keeping, and
        // a failed load must not make an empty form look like unsaved work.
        setSaved(entry ?? emptyDraft(isoDate))
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
  }, [isoDate])

  function updateSituationReaction<K extends keyof DiaryEntryDraft['situationReaction']>(
    key: K,
    value: DiaryEntryDraft['situationReaction'][K],
  ) {
    setDraft((current) => ({
      ...current,
      situationReaction: { ...current.situationReaction, [key]: value },
    }))
  }

  function toggleEmotion(emotion: EmotionName) {
    setDraft((current) => {
      const exists = current.emotions.some((entry) => entry.emotion === emotion)
      const emotions: EmotionEntry[] = exists
        ? current.emotions.filter((entry) => entry.emotion !== emotion)
        : [...current.emotions, { emotion, intensity: 0 }]
      return { ...current, emotions }
    })
  }

  function setEmotionIntensity(emotion: EmotionName, intensity: number) {
    setDraft((current) => ({
      ...current,
      emotions: current.emotions.map((entry) => (entry.emotion === emotion ? { ...entry, intensity } : entry)),
    }))
  }

  async function onSave() {
    // The database records only the description, with NULL meaning "none
    // reported" — so a flag with nothing written under it has nowhere to live.
    if (draft.hasRiskyBehavior && draft.riskyBehaviorNote.trim() === '') {
      setRiskyNoteError(RISKY_NOTE_REQUIRED)
      setDetailsOpen(true)
      return
    }

    setRiskyNoteError(null)
    setSaving(true)
    setSaveError(null)
    try {
      await saveTodayEntry(draft)
      // Marked clean before leaving, or the guard would ask about the very
      // changes that were just written.
      setSaved(draft)
      // Home says it, not this screen: the confirmation has to survive the
      // navigation, and a message shown here would flash for one frame.
      navigate(ROUTES.home, { state: { savedEntry: true } })
    } catch (cause: unknown) {
      setSaveError((cause instanceof ApiError && cause.formMessage) || SAVE_ERROR)
      setSaving(false)
    }
  }

  return (
    <div className="diary-entry-page">
      <header className="diary-entry-header">
        <button
          type="button"
          className="diary-entry-back"
          aria-label="Wróć do strony głównej"
          onClick={leave}
        >
          ←
        </button>
        <div className="diary-entry-header-titles">
          <p className="diary-entry-module-label">PSYCHOTERAPIA</p>
          <h1>{isEditing ? 'Edycja wpisu' : 'Nowy wpis'}</h1>
          <p className="diary-entry-date">{dateLabel}</p>
        </div>
        <HeaderMenu />
      </header>

      {loading && (
        <div className="diary-entry-status" role="status" aria-busy="true">
          Wczytywanie dzisiejszego wpisu…
        </div>
      )}

      {!loading && loadError && (
        <div className="diary-entry-status diary-entry-status-error" role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <>
          <section className="diary-entry-lock-banner">
            <span className="diary-entry-lock-icon" aria-hidden="true">

            </span>
            <p>
              Ten wpis możesz edytować do końca dzisiejszego dnia ({dateLabel}). Później zostanie zapisany na stałe.
            </p>
          </section>

          <section className="diary-entry-card">
            <h2>Jak się teraz czujesz?</h2>
            <MoodPicker value={draft.mood} onChange={(mood) => setDraft((current) => ({ ...current, mood }))} />
          </section>

          <section className="diary-entry-card">
            <h2>Dominujące emocje</h2>
            <EmotionSelector
              selected={draft.emotions}
              onToggle={toggleEmotion}
              onIntensityChange={setEmotionIntensity}
              alertThresholds={EMOTION_ALERTS}
            />
          </section>

          <section className="diary-entry-card">
            <button
              type="button"
              className="diary-entry-collapse-toggle"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((value) => !value)}
            >
              <span>Więcej szczegółów (opcjonalnie)</span>
              <span className="diary-entry-collapse-chevron">{detailsOpen ? '▲' : '▼'}</span>
            </button>

            {detailsOpen && (
              <div className="diary-entry-collapse-body">
                <div className="diary-entry-subsection">
                  <h3>Poziomy i samopoczucie</h3>
                  <LevelSlider
                    id="energy-level"
                    label="Poziom energii"
                    lowLabel="wyczerpanie"
                    highLabel="pełnia energii"
                    value={draft.energyLevel ?? 0}
                    onChange={(energyLevel) => setDraft((current) => ({ ...current, energyLevel }))}
                  />
                  <LevelSlider
                    id="tension-level"
                    label="Poziom napięcia"
                    lowLabel="rozluźnienie"
                    highLabel="skrajne napięcie"
                    value={draft.tensionLevel ?? 0}
                    onChange={(tensionLevel) => setDraft((current) => ({ ...current, tensionLevel }))}
                  />
                </div>

                <div className="diary-entry-subsection">
                  <h3>Sytuacja i reakcja</h3>
                  {/* TODO: this trigger list (utils/triggers.ts) is a reasonable starting set,
                      not final — confirm the definitive list with the client. */}
                  <div className="diary-entry-trigger-chips">
                    {TRIGGER_OPTIONS.map((option) => {
                      const selected = draft.situationReaction.trigger === option
                      return (
                        <button
                          key={option}
                          type="button"
                          className={selected ? 'trigger-chip trigger-chip-selected' : 'trigger-chip'}
                          onClick={() => updateSituationReaction('trigger', selected ? null : option)}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                  {draft.situationReaction.trigger === OTHER_TRIGGER && (
                    <input
                      type="text"
                      className="diary-entry-trigger-other"
                      placeholder="Wpisz własną sytuację/miejsce"
                      value={draft.situationReaction.triggerOther}
                      onChange={(event) => updateSituationReaction('triggerOther', event.target.value)}
                    />
                  )}

                  <div className="diary-entry-field">
                    <label htmlFor="situation">Sytuacja</label>
                    <textarea
                      id="situation"
                      rows={2}
                      value={draft.situationReaction.situation}
                      onChange={(event) => updateSituationReaction('situation', event.target.value)}
                      placeholder="Co się wydarzyło?"
                    />
                  </div>
                  <div className="diary-entry-field">
                    <label htmlFor="emotion-note">Emocja</label>
                    <textarea
                      id="emotion-note"
                      rows={2}
                      value={draft.situationReaction.emotionNote}
                      onChange={(event) => updateSituationReaction('emotionNote', event.target.value)}
                      placeholder="Co poczułeś/poczułaś?"
                    />
                  </div>
                  <div className="diary-entry-field">
                    <label htmlFor="thought">Myśl</label>
                    <textarea
                      id="thought"
                      rows={2}
                      value={draft.situationReaction.thought}
                      onChange={(event) => updateSituationReaction('thought', event.target.value)}
                      placeholder="Co pomyślałeś/pomyślałaś?"
                    />
                  </div>
                  <div className="diary-entry-field">
                    <label htmlFor="behavior">Zachowanie</label>
                    <textarea
                      id="behavior"
                      rows={2}
                      value={draft.situationReaction.behavior}
                      onChange={(event) => updateSituationReaction('behavior', event.target.value)}
                      placeholder="Jak zareagowałeś/zareagowałaś?"
                    />
                  </div>
                </div>

                <div className="diary-entry-subsection">
                  <h3>Własne notatki</h3>
                  <div className="diary-entry-field">
                    <textarea
                      id="notes"
                      rows={4}
                      value={draft.notes}
                      onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Miejsce na wszystko, co chcesz zapisać."
                    />
                  </div>
                </div>

                <div className="diary-entry-subsection">
                  <button
                    type="button"
                    className={
                      draft.hasRiskyBehavior
                        ? 'risky-behavior-toggle risky-behavior-toggle-active'
                        : 'risky-behavior-toggle'
                    }
                    aria-pressed={draft.hasRiskyBehavior}
                    onClick={() => {
                      setRiskyNoteError(null)
                      setDraft((current) => ({ ...current, hasRiskyBehavior: !current.hasRiskyBehavior }))
                    }}
                  >
                    <span className="risky-behavior-icon" aria-hidden="true">
                      !
                    </span>
                    Oznacz zachowanie ryzykowne
                  </button>

                  {draft.hasRiskyBehavior && (
                    <div className="diary-entry-field risky-behavior-field">
                      <label htmlFor="risky-behavior-note">
                        Opis — np. samookaleczenie, zażycie substancji/przedawkowanie leków, upicie
                        się alkoholem, głodzenie się, bardzo silne kłótnie/wybuchy emocji, ryzykowna
                        jazda samochodem
                      </label>
                      <textarea
                        id="risky-behavior-note"
                        rows={3}
                        value={draft.riskyBehaviorNote}
                        aria-invalid={riskyNoteError !== null}
                        onChange={(event) => {
                          setRiskyNoteError(null)
                          setDraft((current) => ({ ...current, riskyBehaviorNote: event.target.value }))
                        }}
                        placeholder="Opisz, co się wydarzyło"
                      />
                      {riskyNoteError && (
                        <p className="diary-entry-field-error" role="alert">
                          {riskyNoteError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {saveError && (
            <div className="diary-entry-status diary-entry-status-error" role="alert">
              {saveError}
            </div>
          )}

          <button
            type="button"
            className="diary-entry-save-button"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Zapisywanie…' : isEditing ? 'Zapisz zmiany' : 'Zapisz wpis'}
          </button>
        </>
      )}
    </div>
  )
}

export default DiaryEntry
