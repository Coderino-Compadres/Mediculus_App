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
  trigger: string | null
  /** Free text used only when trigger === OTHER_TRIGGER. */
  triggerOther: string
  situation: string
  emotionNote: string
  thought: string
  behavior: string
}

/** Full shape of one diary entry, as edited on this screen. */
export interface DiaryEntryDraft {
  /** ISO date (yyyy-mm-dd) the entry belongs to — drives the midnight edit lock. */
  date: string
  mood: MoodLevel | null
  emotions: EmotionEntry[]
  stressLevel: number | null
  energyLevel: number | null
  tensionLevel: number | null
  wellbeingLevel: number | null
  situationReaction: SituationReaction
  notes: string
  /**
   * Confirmed client feature: an optional, free-text flag for risky behavior
   * (self-harm, substance use, etc.) — kept as structured data so a future
   * reports feature can surface it, without building that feature now.
   */
  hasRiskyBehavior: boolean
  riskyBehaviorNote: string
}
