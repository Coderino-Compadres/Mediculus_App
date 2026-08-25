import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import MoodPicker from '../components/MoodPicker'
import EmotionSelector from '../components/EmotionSelector'
import LevelSlider from '../components/LevelSlider'
import type { EmotionName } from '../utils/emotions'
import { OTHER_TRIGGER, TRIGGER_OPTIONS } from '../utils/triggers'
import { loadDiaryEntry, saveDiaryEntry } from '../utils/diaryEntryStorage'
import type { DiaryEntryDraft, EmotionEntry } from '../types/diaryEntry'
import { ROUTES } from '../routes'
import './diaryEntry.css'

/** Matches the alert threshold used on Home for "Średni stres" (US-PT-13). */
const STRESS_ALERT_THRESHOLD = 6

/** 'YYYY-MM-DD' for the local calendar day — used as the storage key and the edit-lock date. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyDraft(isoDate: string): DiaryEntryDraft {
  return {
    date: isoDate,
    mood: null,
    emotions: [],
    stressLevel: 0,
    energyLevel: 0,
    tensionLevel: 0,
    wellbeingLevel: 0,
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

  const existingDraft = useMemo(() => loadDiaryEntry(isoDate), [isoDate])
  const isEditing = existingDraft !== null

  const [draft, setDraft] = useState<DiaryEntryDraft>(() => existingDraft ?? emptyDraft(isoDate))
  const [detailsOpen, setDetailsOpen] = useState(false)

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

  function onSave() {
    // TODO: mock persistence only — replace with a real POST/PUT to the
    // future diary-entry endpoint once the backend supports writes.
    saveDiaryEntry(draft)
    navigate(ROUTES.home)
  }

  return (
    <div className="diary-entry-page">
      <header className="diary-entry-header">
        <button
          type="button"
          className="diary-entry-back"
          aria-label="Wróć do strony głównej"
          onClick={() => navigate(ROUTES.home)}
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

      <section className="diary-entry-lock-banner">
        <span className="diary-entry-lock-icon" aria-hidden="true">
          🕛
        </span>
        <p>
          Ten wpis możesz edytować do końca dzisiejszego dnia ({dateLabel}). Później zostanie zapisany na stałe.
          {/* TODO: only a UI reminder for now — the actual lock is not enforced until the backend exists. */}
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
                id="stress-level"
                label="Poziom stresu"
                lowLabel="spokój"
                highLabel="skrajny stres"
                value={draft.stressLevel ?? 0}
                onChange={(stressLevel) => setDraft((current) => ({ ...current, stressLevel }))}
                alertThreshold={STRESS_ALERT_THRESHOLD}
              />
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
              <LevelSlider
                id="wellbeing-level"
                label="Jakość samopoczucia"
                lowLabel="bardzo źle"
                highLabel="bardzo dobrze"
                value={draft.wellbeingLevel ?? 0}
                onChange={(wellbeingLevel) => setDraft((current) => ({ ...current, wellbeingLevel }))}
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
                onClick={() =>
                  setDraft((current) => ({ ...current, hasRiskyBehavior: !current.hasRiskyBehavior }))
                }
              >
                <span className="risky-behavior-icon" aria-hidden="true">
                  !
                </span>
                Oznacz zachowanie ryzykowne
              </button>

              {draft.hasRiskyBehavior && (
                <div className="diary-entry-field risky-behavior-field">
                  <label htmlFor="risky-behavior-note">
                    Opis (opcjonalnie) — np. samookaleczenie, zażycie substancji/przedawkowanie leków,
                    upicie się alkoholem, głodzenie się, bardzo silne kłótnie/wybuchy emocji, ryzykowna
                    jazda samochodem
                  </label>
                  <textarea
                    id="risky-behavior-note"
                    rows={3}
                    value={draft.riskyBehaviorNote}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, riskyBehaviorNote: event.target.value }))
                    }
                    placeholder="Opisz, co się wydarzyło (opcjonalnie)"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <button type="button" className="diary-entry-save-button" onClick={onSave}>
        {isEditing ? 'Zapisz zmiany' : 'Zapisz wpis'}
      </button>
    </div>
  )
}

export default DiaryEntry
