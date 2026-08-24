import type { EmotionName } from '../utils/emotions'

export interface EmotionRating {
  emotion: EmotionName
  /** 0-10 self-rated intensity; null when the entry named the emotion without rating it. */
  intensity: number | null
}

/** Today's diary entry once it has been saved (before midnight). */
export interface TodayEntry {
  /** `diary.current_mood`, or null when the entry left it blank. */
  moodLabel: string | null
  emotions: EmotionRating[]
}

/** One bar in the 7-day mood chart. */
export interface DayMood {
  dayLabel: string
  date: string
  hasEntry: boolean
  /** null when nothing was written, or when the entry named an emotion outside the app's ten. */
  dominantEmotion: EmotionName | null
  /** 0-10, drives the bar height; null when the day has no rating to draw. */
  intensity: number | null
}

export interface TechniqueSuggestion {
  name: string
  matchReason: string
}

/** Everything the home screen shows for the logged-in patient. */
export interface HomeDashboard {
  streakDays: number
  todayEntry: TodayEntry | null
  /** Always 7 days, oldest first, ending today. */
  week: DayMood[]
  /** 0-10 averages over those 7 days; null when nothing in the window was rated. */
  averageStress: number | null
  averageEnergy: number | null
  technique: TechniqueSuggestion | null
}
