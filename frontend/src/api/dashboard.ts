/**
 * The /api/dashboard/ endpoints, and the translation from the API's snake_case
 * columns to the camelCase shapes the screens use — the same split as auth.ts.
 */

import { apiRequest } from './client'
import { EMOTION_COLORS, type EmotionName } from '../utils/emotions'
import type {
  DayMood,
  EmotionRating,
  HomeDashboard,
  TechniqueSuggestion,
  TodayEntry,
} from '../types/dashboard'

/** As `core.dashboard.build_home_dashboard` returns it. */
interface EmotionRatingPayload {
  emotion: string
  intensity: number | null
}

interface HomeDashboardPayload {
  streak_days: number
  today_entry: { mood_label: string | null; emotions: EmotionRatingPayload[] } | null
  week: {
    date: string
    has_entry: boolean
    dominant_emotion: string | null
    intensity: number | null
  }[]
  average_stress: number | null
  average_energy: number | null
  technique: { name: string; match_reason: string } | null
}

/** Indexed by Date.getDay(), i.e. starting on Sunday. */
const WEEKDAY_LABELS = ['Ndz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob']

/**
 * The backend sends canonical names from `core/emotions.py`, but it is the only
 * thing keeping the two lists in step — an emotion added there and not here has
 * no colour, so treat an unknown name as "no colour" rather than rendering a
 * transparent bar.
 */
function toEmotionName(value: string | null): EmotionName | null {
  if (value && Object.prototype.hasOwnProperty.call(EMOTION_COLORS, value)) {
    return value as EmotionName
  }
  return null
}

/**
 * 'YYYY-MM-DD' as a local calendar day. `new Date(iso)` would read it as UTC
 * midnight, which lands on the previous day for anyone west of Greenwich.
 */
function weekdayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]
}

function toEmotionRating(payload: EmotionRatingPayload): EmotionRating | null {
  const emotion = toEmotionName(payload.emotion)
  return emotion ? { emotion, intensity: payload.intensity } : null
}

function toDayMood(payload: HomeDashboardPayload['week'][number]): DayMood {
  return {
    date: payload.date,
    dayLabel: weekdayLabel(payload.date),
    hasEntry: payload.has_entry,
    dominantEmotion: toEmotionName(payload.dominant_emotion),
    intensity: payload.intensity,
  }
}

function toTodayEntry(payload: HomeDashboardPayload['today_entry']): TodayEntry | null {
  if (!payload) return null
  return {
    moodLabel: payload.mood_label,
    emotions: payload.emotions.map(toEmotionRating).filter((rating) => rating !== null),
  }
}

function toTechnique(payload: HomeDashboardPayload['technique']): TechniqueSuggestion | null {
  return payload ? { name: payload.name, matchReason: payload.match_reason } : null
}

export async function fetchHomeDashboard(): Promise<HomeDashboard> {
  const payload = await apiRequest<HomeDashboardPayload>('/api/dashboard/home/')
  return {
    streakDays: payload.streak_days,
    todayEntry: toTodayEntry(payload.today_entry),
    week: payload.week.map(toDayMood),
    averageStress: payload.average_stress,
    averageEnergy: payload.average_energy,
    technique: toTechnique(payload.technique),
  }
}
