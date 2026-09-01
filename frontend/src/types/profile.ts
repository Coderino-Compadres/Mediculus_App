import type { ConsentId } from '../utils/consents'
import type { PhoneNumber } from '../utils/phone'

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

/**
 * The care relationship: who is treating this patient.
 *
 * ONE SOURCE, TWO SCREENS. "Profil" shows the specialist under "OPIEKA", and the
 * safety plan lists them under "Kontakt do terapeuty lub lekarza". It is the same
 * relationship — `patient.specjalist` in user_db — so it is described once, here,
 * and read once, from `src/data/profile.ts`. Giving the safety plan a specialist
 * field of its own would let the same therapist appear on two screens with two
 * different names or two different numbers the moment a backend fills one in.
 *
 * The card also carried the next and last appointment. Both were removed on
 * request, and the `Visit` shape they needed went with them; if the appointment
 * calendar is ever built, that is where those rows come back from, not from here.
 *
 * `approach` outlived that removal on purpose — see below.
 */
export interface CareDetails {
  /** The specialist treating the patient, as they should be addressed. */
  specialist: string
  /**
   * Therapeutic approach — 'CBT / DBT' in the mockup.
   *
   * No longer shown in the profile's "OPIEKA" card (the "Nurt" row was removed on
   * request), but still read by the safety plan, which prints it as the detail
   * line under the therapist's name — see `specialistContact` in
   * components/SafetyPlanView.tsx. So this is not a leftover: dropping it blanks
   * that line. If it should disappear there too, remove it here and have
   * `specialistContact` hand back `detail: null`.
   */
  approach: string
  /**
   * For the safety plan, which needs a number to dial and not just a name.
   *
   * Nullable because a name without a number is a real state: `patient.specjalist`
   * gives the profile card everything it needs, and nothing in the schema says a
   * contact number exists. When it is null the safety plan says who the therapist
   * is and stops there, rather than rendering a dead link.
   */
  phone: PhoneNumber | null
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
