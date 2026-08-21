const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Podaj adres e-mail.'
  if (!EMAIL_RE.test(value)) return 'Podaj poprawny adres e-mail.'
  return null
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Podaj hasło.'
  if (value.length < 8) return 'Hasło musi mieć co najmniej 8 znaków.'
  return null
}

export function validateName(value: string, fieldLabel: string): string | null {
  if (!value.trim()) return `Podaj ${fieldLabel}.`
  return null
}

export function validateConfirmPassword(value: string, password: string): string | null {
  if (!value) return 'Potwierdź hasło.'
  if (value !== password) return 'Hasła nie są identyczne.'
  return null
}

export function validateConsent(
  value: boolean,
  message = 'Ta zgoda jest wymagana, aby założyć konto.',
): string | null {
  if (!value) return message
  return null
}

export function validateDateOfBirth(value: string): string | null {
  if (!value) return 'Podaj datę urodzenia.'

  // <input type="date"> always hands over 'YYYY-MM-DD' regardless of how the
  // browser displays it, and it cannot produce a non-existent day — so the only
  // things left to check are the bounds. The explicit time keeps the parse in
  // local time, or someone born today looks like tomorrow west of Greenwich.
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Podaj poprawną datę urodzenia.'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date > today) return 'Data urodzenia nie może być z przyszłości.'
  if (date.getFullYear() < 1900) return 'Sprawdź datę urodzenia — wygląda na literówkę.'
  return null
}

export function validateAccountType(value: string): string | null {
  if (!value) return 'Wybierz rodzaj konta.'
  return null
}

/** Where "małoletni" stops. Mirrors ADULT_AGE in core/serializers.py. */
export const ADULT_AGE = 18

/**
 * Full years completed today, from the 'YYYY-MM-DD' a date input produces.
 *
 * Compares month and day rather than dividing a millisecond difference by a
 * year: the arithmetic version puts someone born on 29 February a day out.
 */
export function ageFromDateOfBirth(value: string): number | null {
  const born = new Date(`${value}T00:00:00`)
  if (Number.isNaN(born.getTime())) return null

  const today = new Date()
  const hadBirthdayThisYear =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate())
  return today.getFullYear() - born.getFullYear() - (hadBirthdayThisYear ? 0 : 1)
}
