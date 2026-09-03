/**
 * Wording for the guardian's summary of a linked child.
 *
 * Pure functions in a module of their own, like utils/profile.ts and
 * utils/triggers.ts — the phrasing on this card is the part most worth testing
 * and the part that needs no screen to test.
 */

import { daysGenitive } from './analysis'
import { fromIsoDate, toIsoDate } from './days'

/** '12 sierpnia 2026' — a link can be months old, so the year is not optional. */
export function linkedSinceLabel(iso: string | null): string | null {
  if (!iso) return null
  const moment = new Date(iso)
  if (Number.isNaN(moment.getTime())) return null
  return moment.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * How long ago the last entry was, in the words a person would use.
 *
 * A guardian reads this card to answer one question — "is my child still doing
 * this" — and "3 dni temu" answers it where a date makes them count. The date
 * stays available as the row's `title`, for the one case a number is wanted.
 *
 * A future date is possible in principle (a clock skewed between the server and
 * the phone) and is reported as "dzisiaj" rather than as a negative count: the
 * screen must not tell a guardian their child wrote an entry tomorrow.
 */
export function lastEntryLabel(iso: string | null, today: Date): string | null {
  if (!iso) return null
  const date = fromIsoDate(iso)
  if (Number.isNaN(date.getTime())) return null

  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((midnight.getTime() - date.getTime()) / 86_400_000)

  if (days <= 0) return 'dzisiaj'
  if (days === 1) return 'wczoraj'
  return `${days} ${daysGenitive(days)} temu`
}

/** 'YYYY-MM-DD' as a date a person reads, for the tooltip behind the label above. */
export function entryDateLabel(iso: string | null): string | null {
  if (!iso) return null
  return fromIsoDate(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * How to name the child on the card.
 *
 * Name when there is one, address when there is not, and a neutral fallback when
 * the row somehow has neither — an unnamed card would leave a guardian with two
 * children unable to tell which is which, which is worse than a generic label.
 */
export function childLabel(child: {
  childName: string | null
  childSurname: string | null
  childEmail: string | null
}): string {
  const name = [child.childName?.trim(), child.childSurname?.trim()]
    .filter(Boolean)
    .join(' ')
  return name || child.childEmail?.trim() || 'Konto dziecka'
}

/**
 * Whether the run of days is worth a word of its own.
 *
 * One day is not a streak — it is an entry, already reported next to it — and
 * "1 dzień z rzędu" on a card a parent reads for reassurance is noise.
 */
export function showsStreak(streakDays: number): boolean {
  return streakDays >= 2
}

/** Today, as the local calendar day — the reference `lastEntryLabel` compares to. */
export function todayIso(): string {
  return toIsoDate(new Date())
}
