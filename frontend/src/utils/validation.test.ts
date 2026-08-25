import { describe, expect, it } from 'vitest'
import {
  ADULT_AGE,
  ageFromDateOfBirth,
  validateAccountType,
  validateConfirmPassword,
  validateConsent,
  validateDateOfBirth,
  validateEmail,
  validateName,
  validatePassword,
} from './validation'

/** 'YYYY-MM-DD' for a date `years` years and `days` days before today. */
function birthday(years: number, days = 0): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

describe('validateEmail', () => {
  it('accepts an ordinary address', () => {
    expect(validateEmail('kacper@example.com')).toBeNull()
  })

  it('tells an empty field apart from a malformed one', () => {
    expect(validateEmail('   ')).toBe('Podaj adres e-mail.')
    expect(validateEmail('kacper@example')).toBe('Podaj poprawny adres e-mail.')
  })

  it.each(['brak-malpy.pl', 'dwie@@malpy.pl', 'ze spacja@example.com', '@example.com'])(
    'rejects %s',
    (value) => {
      expect(validateEmail(value)).not.toBeNull()
    },
  )
})

describe('validatePassword', () => {
  it('requires eight characters', () => {
    expect(validatePassword('Haslo12')).toBe('Hasło musi mieć co najmniej 8 znaków.')
    expect(validatePassword('Haslo123')).toBeNull()
  })

  it('does not trim — a password of spaces is still eight characters', () => {
    expect(validatePassword('        ')).toBeNull()
  })
})

describe('validateConfirmPassword', () => {
  it('accepts a match and rejects a mismatch', () => {
    expect(validateConfirmPassword('Haslo123', 'Haslo123')).toBeNull()
    expect(validateConfirmPassword('Haslo124', 'Haslo123')).toBe('Hasła nie są identyczne.')
  })

  it('asks for confirmation before comparing', () => {
    expect(validateConfirmPassword('', '')).toBe('Potwierdź hasło.')
  })
})

describe('validateName', () => {
  it('names the field it is complaining about', () => {
    expect(validateName('  ', 'imię')).toBe('Podaj imię.')
    expect(validateName('Kacper', 'imię')).toBeNull()
  })
})

describe('validateConsent', () => {
  it('refuses an unticked box and allows a custom message', () => {
    expect(validateConsent(true)).toBeNull()
    expect(validateConsent(false)).toContain('wymagana')
    expect(validateConsent(false, 'Własny tekst.')).toBe('Własny tekst.')
  })
})

describe('validateAccountType', () => {
  it('only requires that something was chosen', () => {
    expect(validateAccountType('')).toBe('Wybierz rodzaj konta.')
    expect(validateAccountType('patient')).toBeNull()
  })
})

describe('validateDateOfBirth', () => {
  it('accepts a plausible date', () => {
    expect(validateDateOfBirth('1994-06-18')).toBeNull()
  })

  it('refuses an empty value', () => {
    expect(validateDateOfBirth('')).toBe('Podaj datę urodzenia.')
  })

  it('refuses the future', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(validateDateOfBirth(tomorrow.toISOString().slice(0, 10))).toBe(
      'Data urodzenia nie może być z przyszłości.',
    )
  })

  it('accepts today — someone born today is not in the future', () => {
    expect(validateDateOfBirth(new Date().toISOString().slice(0, 10))).toBeNull()
  })

  it('treats a year before 1900 as a typo rather than a very old patient', () => {
    expect(validateDateOfBirth('0202-05-14')).toContain('literówkę')
  })
})

describe('ageFromDateOfBirth', () => {
  it('counts full years only', () => {
    expect(ageFromDateOfBirth(birthday(ADULT_AGE))).toBe(ADULT_AGE)
    // One day short of the birthday is still the year before.
    expect(ageFromDateOfBirth(birthday(ADULT_AGE, -1))).toBe(ADULT_AGE - 1)
  })

  it('counts the birthday itself as the new age', () => {
    expect(ageFromDateOfBirth(birthday(ADULT_AGE, 0))).toBe(ADULT_AGE)
  })

  it('answers null for something that is not a date', () => {
    expect(ageFromDateOfBirth('nie-data')).toBeNull()
  })

  it('mirrors the backend policy constant rather than inlining 18', () => {
    // core/serializers.py names the same boundary ADULT_AGE, and RODO art. 8
    // could move it to 16 -- the two have to move together.
    expect(ADULT_AGE).toBe(18)
  })
})
