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

/**
 * One emotion's colour, faded to `ratio` of full strength.
 *
 * For the crossing tables on the diet module's "Analiza", where a cell is
 * shaded in the colour of the emotion its row is about. The alpha floor is
 * deliberate: a cell holding one meal out of a row's eight would come out at
 * 0,12 opacity and be indistinguishable from an empty one, so the range starts
 * where a tint is actually visible and a *measured* difference is never drawn
 * as nothing. A cell of zero asks for `ratio` 0 and is left untinted, which is
 * the one case where "no colour" is the right answer.
 *
 * Alpha rather than mixing towards white, because these cells sit on a card
 * whose background is `--color-surface` rather than pure white — a mix computed
 * against the wrong ground reads as a slightly dirty version of the hue.
 */
export function emotionTint(emotion: EmotionName, ratio: number): string {
  if (ratio <= 0) return 'transparent'

  const hex = EMOTION_COLORS[emotion]
  const [red, green, blue] = [1, 3, 5].map((index) =>
    parseInt(hex.slice(index, index + 2), 16),
  )
  const alpha = TINT_MIN_ALPHA + (TINT_MAX_ALPHA - TINT_MIN_ALPHA) * Math.min(1, ratio)
  // `Number(...)` drops the trailing zeroes `toFixed` leaves behind, so the
  // string this returns is the same string the browser gives back when it is
  // read off `style.backgroundColor` — which is what lets a test compare the
  // two without re-implementing the serialisation.
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`
}

/** Where a tint becomes visible on `--color-surface`, and where it stops before
 *  the number printed on top of it loses contrast. */
const TINT_MIN_ALPHA = 0.18
const TINT_MAX_ALPHA = 0.8

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
