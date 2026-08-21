import type { EmotionName } from '../utils/emotions'

export interface EmotionRating {
  emotion: EmotionName
  /** 0-10 self-rated intensity. */
  intensity: number
}

/** Today's diary entry once it has been saved (before midnight). */
export interface TodayEntry {
  moodLabel: string
  emotions: EmotionRating[]
}

/** One bar in the 7-day mood chart. */
export interface DayMood {
  dayLabel: string
  date: string
  hasEntry: boolean
  dominantEmotion?: EmotionName
  /** 0-10, drives the bar height; undefined when hasEntry is false. */
  intensity?: number
}

export interface TechniqueSuggestion {
  name: string
  matchReason: string
}
