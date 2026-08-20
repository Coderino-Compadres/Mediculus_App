const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value) {
  if (!value.trim()) return 'Podaj adres e-mail.'
  if (!EMAIL_RE.test(value)) return 'Podaj poprawny adres e-mail.'
  return null
}

export function validatePassword(value) {
  if (!value) return 'Podaj hasło.'
  if (value.length < 8) return 'Hasło musi mieć co najmniej 8 znaków.'
  return null
}

export function validateName(value, fieldLabel) {
  if (!value.trim()) return `Podaj ${fieldLabel}.`
  return null
}

export function validateConfirmPassword(value, password) {
  if (!value) return 'Potwierdź hasło.'
  if (value !== password) return 'Hasła nie są identyczne.'
  return null
}

export function validateConsent(value, message = 'Ta zgoda jest wymagana, aby założyć konto.') {
  if (!value) return message
  return null
}
