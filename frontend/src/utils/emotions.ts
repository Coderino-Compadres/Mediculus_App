/**
 * The 10 emotions tracked across the app (diary entries, mood charts, technique
 * matching) and their confirmed brand colors. Reused wherever an emotion needs a
 * color, not just on the dashboard.
 */
export type EmotionName =
  | 'Radość'
  | 'Smutek'
  | 'Lęk'
  | 'Złość'
  | 'Stres'
  | 'Poczucie winy'
  | 'Frustracja'
  | 'Wstyd'
  | 'Bezradność'
  | 'Spokój'

/** Named because it is referenced in code, not just rendered: stress is the one
 *  emotion of the ten stored on the diary row itself (`diary.stress_level`),
 *  and the entry form puts an alert threshold on it. */
export const STRES: EmotionName = 'Stres'

export const EMOTION_COLORS: Record<EmotionName, string> = {
  Radość: '#E0B45C',
  Smutek: '#6C93C7',
  Lęk: '#9B85C4',
  Złość: '#D9776A',
  Stres: '#E09B6A',
  'Poczucie winy': '#5FA3A0',
  Frustracja: '#C878A8',
  Wstyd: '#C99AA6',
  Bezradność: '#8A93A8',
  Spokój: '#7FA98F',
}
