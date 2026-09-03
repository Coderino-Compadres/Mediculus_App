/**
 * Formatting for the profile screen — pure functions, so the wording can be
 * tested without mounting the screen (same reason utils/triggers.ts and
 * utils/roles.ts exist).
 */

/**
 * The initials for the avatar circle.
 *
 * Built from whatever the account actually has, in that order: two names give
 * 'AK', one name gives one letter, and an account with no name at all falls back
 * to the e-mail's first letter. It never returns an empty string, because an
 * empty circle reads as a failed image rather than as a missing name.
 *
 * `Array.from` rather than `charAt`, so a name starting outside the BMP is not
 * cut in half; `toLocaleUpperCase('pl')` because Polish is the UI's locale and
 * casing rules are locale-dependent.
 */
export function initials(firstName: string | null, lastName: string | null, email: string | null): string {
  const letters = [firstName, lastName]
    .map((part) => Array.from(part?.trim() ?? '')[0] ?? '')
    .filter(Boolean)

  const source = letters.length > 0 ? letters : [Array.from(email?.trim() ?? '')[0] ?? '']
  return source.join('').toLocaleUpperCase('pl') || '?'
}

/**
 * The name to print next to the avatar, or null when the account has neither
 * half — in which case the screen shows the e-mail on its own rather than an
 * empty heading.
 */
export function fullName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ')
  return name || null
}

/**
 * '14 lipca 2026' — a consent date needs its year; it can be years old.
 *
 * Takes the full instant the column stores (`2026-07-14T09:31:02Z`), not a
 * 'YYYY-MM-DD' string, and renders the calendar day it falls on in the reader's
 * own zone. The time is deliberately not shown: it is kept because RODO art.
 * 7(1) asks us to be able to prove *when*, and a date is what a person reading
 * their own profile needs.
 *
 * Returns null for a value that is not a date at all, so a malformed column
 * shows the consent without a date rather than the words "Invalid Date".
 */
export function consentDateLabel(iso: string): string | null {
  const moment = new Date(iso)
  if (Number.isNaN(moment.getTime())) return null
  return moment.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
