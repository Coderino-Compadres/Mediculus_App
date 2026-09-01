import type { ConsentId } from '../utils/consents'

/**
 * What the "Profil" screen shows, split by where it comes from.
 *
 * The split is the point. Identity — name, e-mail, account type — is data the
 * app genuinely holds about the signed-in user: it is collected at registration
 * and arrives through `useAuth()`, so it is never described here. Everything in
 * this file is the other half: figures and care details that have no endpoint
 * yet and are read from `src/data/profile.ts` until they do.
 *
 * Keeping that half behind these types is what makes the switch to a real API a
 * change of import in one file rather than a rewrite of the screen.
 */

/** The two counters under the identity card. */
export interface ProfileActivity {
  /** Diary entries written, all time. */
  entryCount: number
  /** Consecutive days with an entry, ending today or yesterday. */
  streakDays: number
}

/** One appointment, as much of it as is known. */
export interface Visit {
  /** 'YYYY-MM-DD', the local calendar day — same shape as the diary's dates. */
  date: string
  /** 'HH:MM', or null when only the day is known (the mockup shows both cases). */
  time: string | null
}

/** The "Opieka" card. */
export interface CareDetails {
  /** The specialist treating the patient, as they should be addressed. */
  specialist: string
  /** Therapeutic approach — 'CBT / DBT' in the mockup. */
  approach: string
  nextVisit: Visit | null
  lastVisit: Visit | null
}

/** A consent that has been given, and when. */
export interface ConsentGrant {
  id: ConsentId
  /** 'YYYY-MM-DD'. Mirrors `user.data_consent_at` / `user.services_consent_at`. */
  grantedAt: string
}

/**
 * Which consent (or consents) a withdrawal covers.
 *
 * Three values rather than two because withdrawing both at once is its own
 * request, not two of the others: RODO art. 7(3) asks for withdrawal to be as
 * easy as consenting, and consenting to both was one gesture.
 */
export type ConsentWithdrawalScope = 'data' | 'services' | 'all'

/**
 * Why the app is about to stop working for this account.
 *
 * All three end the same way and therefore share one confirmation screen — what
 * differs is only the sentence explaining how the user got there, and a screen
 * that said "usuwasz konto" to somebody who pressed "wycofaj zgodę" would be
 * describing a decision they did not make.
 */
export type AccountClosureReason =
  | 'delete-account'
  | 'withdraw-data-consent'
  | 'withdraw-all-consents'
