/**
 * Formatting for the profile screen — pure functions, so the wording can be
 * tested without mounting the screen (same reason utils/triggers.ts and
 * utils/roles.ts exist).
 */

import { fromIsoDate } from './days'
import type { Visit } from '../types/profile'

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

/** '19 sierpnia' — a day, in the form the rest of the app writes dates. */
function dayLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
}

/**
 * '19 sierpnia, 17:00', or just '19 sierpnia' when the hour is unknown.
 *
 * The time is printed verbatim rather than parsed into a Date: it is already a
 * wall-clock time in the patient's own timezone, and round-tripping it through
 * one is how an appointment moves by an hour.
 */
export function visitLabel(visit: Visit): string {
  return visit.time ? `${dayLabel(visit.date)}, ${visit.time}` : dayLabel(visit.date)
}

/** '14 lipca 2026' — a consent date needs its year; it can be years old. */
export function consentDateLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
