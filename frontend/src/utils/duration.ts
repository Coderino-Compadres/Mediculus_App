/**
 * The technique forms' "Czas trwania (minuty)" field, checked before it is sent.
 *
 * WHY THIS EXISTS. The field is free text (`inputMode="numeric"` only picks the
 * keyboard), and the payload used to be `Number(value)`: "abc", "5 min" or "5,5"
 * became `NaN`, `JSON.stringify` turned that into `null`, and the backend stored
 * "no duration" — a save that succeeded while silently dropping what the
 * specialist typed. Asked here instead, under the field, before any request.
 *
 * The bounds are `duration_min` in core/techniques.py and core/diet_techniques.py
 * (1-600), and so are the two messages that mirror theirs.
 */

export const MIN_DURATION = 1
export const MAX_DURATION = 600

export const DURATION_NOT_A_NUMBER = 'Podaj czas w pełnych minutach, np. 5.'
export const DURATION_TOO_SMALL = 'Czas trwania musi być dodatni.'
export const DURATION_TOO_LARGE = 'Czas trwania wygląda na literówkę.'

/** The refusal for this value, or null — an empty field is a valid "not given". */
export function durationError(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return DURATION_NOT_A_NUMBER
  const minutes = Number(trimmed)
  if (minutes < MIN_DURATION) return DURATION_TOO_SMALL
  if (minutes > MAX_DURATION) return DURATION_TOO_LARGE
  return null
}
