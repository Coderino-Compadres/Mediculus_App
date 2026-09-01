import type { PhoneNumber } from '../utils/phone'

/**
 * The care relationship: who is treating this patient.
 *
 * ONE SOURCE, TWO SCREENS. "Profil" shows the specialist under "OPIEKA", and the
 * safety plan lists them under "Kontakt do terapeuty lub lekarza". The data is
 * the same relationship — `patient.specjalist` in user_db — so it is described
 * once, here, and read once, from `src/data/profile.ts`. Giving the safety plan a
 * specialist field of its own would let the same therapist appear on two screens
 * with two different names or two different numbers the moment a backend fills
 * one of them in.
 *
 * MERGE NOTE: this file is the care half of the profile screen's types, and the
 * profile screen itself is being built in parallel on `frontend-profil`, where
 * this same path also declares `ProfileActivity`, `ConsentGrant`,
 * `ConsentWithdrawalScope` and `AccountClosureReason`. `Visit` and `CareDetails`
 * below are that branch's declarations verbatim, plus one added field (`phone`,
 * see below) — so when the two branches meet, take the profile branch's longer
 * file and re-add `phone` to `CareDetails`. Do not resolve it by keeping two
 * types.
 */

/** One appointment, as much of it as is known. */
export interface Visit {
  /** 'YYYY-MM-DD', the local calendar day — same shape as the diary's dates. */
  date: string
  /** 'HH:MM', or null when only the day is known (the mockup shows both cases). */
  time: string | null
}

/** The "Opieka" card, and the specialist row on the safety plan. */
export interface CareDetails {
  /** The specialist treating the patient, as they should be addressed. */
  specialist: string
  /** Therapeutic approach — 'CBT / DBT' in the mockup. */
  approach: string
  /**
   * Added for the safety plan, which needs a number to dial and not just a name.
   *
   * Nullable because a name without a number is a real state: `patient.specjalist`
   * gives the profile card everything it needs, and nothing in the schema says a
   * contact number exists. When it is null the safety plan says who the therapist
   * is and stops there, rather than rendering a dead link.
   */
  phone: PhoneNumber | null
  nextVisit: Visit | null
  lastVisit: Visit | null
}
