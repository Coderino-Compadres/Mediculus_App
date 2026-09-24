/**
 * The /api/dashboard/ endpoints, and the translation from the API's snake_case
 * columns to the camelCase shapes the screens use — the same split as auth.ts.
 */

import { apiRequest } from './client'
import { weekdayShortLabel } from '../utils/days'
import { EMOTION_COLORS, type EmotionName } from '../utils/emotions'
import type { DayMood, EmotionRating, HomeDashboard, TodayEntry } from '../types/dashboard'

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
  /* The endpoint also sends `technique`, the report's suggestion for today. It
     is deliberately not declared here: the card that rendered it was removed
     from /home, so mapping it would be a field nothing reads. The backend still
     computes it from `raport` — see core/dashboard.py — and putting the card
     back is a matter of restoring this line and its mapping. */
}


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

/** The app's one set of weekday labels — see utils/days.ts. */
function weekdayLabel(iso: string): string {
  return weekdayShortLabel(iso)
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

export async function fetchHomeDashboard(): Promise<HomeDashboard> {
  const payload = await apiRequest<HomeDashboardPayload>('/api/dashboard/home/')
  return {
    streakDays: payload.streak_days,
    todayEntry: toTodayEntry(payload.today_entry),
    week: payload.week.map(toDayMood),
    averageStress: payload.average_stress,
    averageEnergy: payload.average_energy,
  }
}
