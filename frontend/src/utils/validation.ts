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
