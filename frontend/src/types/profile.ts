import type { ConsentId } from '../utils/consents'
import type { PhoneNumber } from '../utils/phone'

/**
 * What the "Profil" screen shows, split by where it comes from.
 *
 * The split is still the point, but both halves are real now. Identity — name,
 * e-mail, account type — and the two consent moments are columns on `user` and
 * arrive with the session through `useAuth()`. Everything in this file is the
 * other half: the counters and the care relationship, which need medical_db and
 * therefore have a URL of their own, `GET /api/account/profile/`.
 *
 * `src/data/profile.ts` used to stand in for all of it, hardcoded to the
 * mockup's example patient — eight entries, a six-day streak, a therapist
 * called Marta Zielińska and two consents granted on 14 July 2026. It is gone;
 * `src/api/profile.ts` is what these shapes are filled from.
 */

/** The two counters under the identity card. */
export interface ProfileActivity {
  /** Diary entries written, all time — the same rows "Dzienniczki" lists. */
  entryCount: number
  /** Consecutive days with an entry, ending today or yesterday — /home's streak. */
  streakDays: number
}

/**
 * The answer from `GET /api/account/profile/`.
 *
 * Only ever asked for by an account that has a `patient` row: the endpoint is
 * behind `_require_patient`, so a guardian gets a 403 rather than a profile
 * full of zeroes. See `hasPatientProfile` in src/api/auth.ts.
 */
export interface AccountProfile {
  activity: ProfileActivity
  /** null when nobody is assigned yet — an ordinary state, not a failure. */
  care: CareDetails | null
}

/**
 * The care relationship: who is treating this patient.
 *
 * ONE SOURCE, TWO SCREENS. "Profil" shows the specialist under "OPIEKA", and the
 * safety plan lists them under "Kontakt do terapeuty lub lekarza". It is the same
 * relationship — `patient.specjalist` in user_db — so it is described once, here,
 * and fetched once, by `useAccountProfile`. Giving the safety plan a specialist
 * field of its own would let the same therapist appear on two screens with two
 * different names or two different numbers.
 *
 * The card also carried the next and last appointment. Both were removed on
 * request, and the `Visit` shape they needed went with them; if the appointment
 * calendar is ever built, that is where those rows come back from, not from here.
 *
 * `approach` outlived that removal on purpose — see below.
 */
export interface CareDetails {
  /**
   * The specialist treating the patient, as they should be addressed.
   *
   * Never empty: the backend falls back to the specialist's e-mail when their
   * `user` row carries no name, because an assigned specialist with a blank
   * name is a broken record rather than an absent relationship.
   */
  specialist: string
  /**
   * Therapeutic approach — 'CBT / DBT' in the mockup.
   *
   * No longer shown in the profile's "OPIEKA" card (the "Nurt" row was removed on
   * request), but still read by the safety plan, which prints it as the detail
   * line under the therapist's name — see `specialistContact` in
   * components/SafetyPlanView.tsx.
   *
   * Nullable, because what fills it is `specjalist.specjalization` — the closest
   * thing the schema holds, and not necessarily the nurt the mockup meant. An
   * unfilled column blanks that detail line, which `ContactRow` already handles.
   */
  approach: string | null
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

/**
 * A consent that has been given, and when.
 *
 * Built from the session user by `consentGrants` in utils/consents.ts rather
 * than fetched: `user.data_consent_at` / `services_consent_at` already arrive on
 * /api/auth/me/. A consent that was never granted has no entry at all, which is
 * what lets the screen say "Nieudzielona" without inferring it.
 */
export interface ConsentGrant {
  id: ConsentId
  /** A full ISO instant, as the column stores it — not a date string. */
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
