import type { MoodLevel, MoodOption } from '../types/diaryEntry'

/**
 * Colors reused from the existing brand palette (emotions.ts / theme.css),
 * not new ones: bad end borrows Złość/Stres, good end borrows Spokój/Sage.
 */
export const MOOD_OPTIONS: MoodOption[] = [
  { value: 'very_bad', label: 'Bardzo źle', color: '#D9776A' },
  { value: 'bad', label: 'Źle', color: '#E09B6A' },
  { value: 'neutral', label: 'Neutralnie', color: '#8A93A8' },
  { value: 'good', label: 'Dobrze', color: '#7FA98F' },
  { value: 'very_good', label: 'Bardzo dobrze', color: '#4F7A64' },
]

/** 1-5 position on the scale above — drives the "Dzienniczki" list badge and the day-quality filter. */
export const MOOD_RANK: Record<MoodLevel, number> = {
  very_bad: 1,
  bad: 2,
  neutral: 3,
  good: 4,
  very_good: 5,
}
