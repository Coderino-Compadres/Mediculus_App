import type { EmotionName } from '../utils/emotions'

export type MoodLevel = 'very_bad' | 'bad' | 'neutral' | 'good' | 'very_good'

export interface MoodOption {
  value: MoodLevel
  label: string
  /** Border/accent color for this tile, drawn from the existing brand palette. */
  color: string
}

/** One selected emotion chip with its optional 0-10 intensity. */
export interface EmotionEntry {
  emotion: EmotionName
  intensity: number | null
}

/** "Sytuacja i reakcja" — the CBT/ABC-style breakdown the client asked for. */
export interface SituationReaction {
  /** One of TRIGGER_OPTIONS, or null. OTHER_TRIGGER means "see triggerOther". */
  trigger: string | null
  /**
   * Free text used only when trigger === OTHER_TRIGGER. The two collapse into
   * one `situation_place` column on the wire — see src/api/diary.ts — because a
   * separate "was it from the list" flag was not worth a column of its own.
   */
  triggerOther: string
  situation: string
  emotionNote: string
  thought: string
  behavior: string
}

/** Full shape of one diary entry, as edited on this screen.
 *
 * There is deliberately no separate stress or wellbeing slider: stress is rated
 * on the emotion picker like the other nine emotions (and lands in
 * `diary.stress_level`), and the five-tile mood question above already answers
 * "how are you feeling".
 */
export interface DiaryEntryDraft {
  /** ISO date (yyyy-mm-dd) the entry belongs to — drives the midnight edit lock. */
  date: string
  mood: MoodLevel | null
  emotions: EmotionEntry[]
  energyLevel: number | null
  tensionLevel: number | null
  situationReaction: SituationReaction
  notes: string
  /**
   * Confirmed client feature: a flag for risky behavior (self-harm, substance
   * use, etc.). The database stores only the description, with NULL meaning
   * "none reported" — so this flag has to imply a non-empty description, which
   * is why the form refuses to save a flagged entry without one.
   */
  hasRiskyBehavior: boolean
  riskyBehaviorNote: string
}

/**
 * One entry as it appears in the "Dzienniczki" list/detail screens — the same
 * shape DiaryEntry.tsx saves (or GET /api/diary/today/ returns), plus an id to
 * route to and the timestamp it was saved at (shown in the archival detail view).
 */
export interface JournalListEntry extends DiaryEntryDraft {
  id: string
  savedAt: string
}
