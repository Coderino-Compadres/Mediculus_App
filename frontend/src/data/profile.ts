import type { CareDetails } from '../types/profile'

/**
 * The parts of the profile screen that have no endpoint yet.
 *
 * Hardcoded on purpose, and hardcoded *here* rather than in a screen: when the
 * backend for these lands, the screens that read them should change by swapping
 * this import for an `api/profile.ts` call, not by being rewritten.
 *
 * MERGE NOTE: the profile screen is being built in parallel on
 * `frontend-profil`, where this same path also exports `PROFILE_ACTIVITY` and
 * `CONSENT_GRANTS`. `PROFILE_CARE` below is that branch's value verbatim plus
 * `phone` — see the same note in `src/types/profile.ts`. Resolve a conflict by
 * keeping the longer file and re-adding `phone`, never by keeping two copies:
 * the whole point of the safety plan reading this constant is that "Profil" and
 * "Plan bezpieczeństwa" cannot name two different therapists.
 */

/**
 * TODO(backend): `specialist` and `approach` are `patient.specjalist` in user_db
 * and need only a serializer. `phone` has no column at all yet — the safety plan
 * is the first screen that wants to dial the specialist, and where that number
 * should live (on `specjalist`, or on the plan the specialist writes) is a
 * schema decision for whoever builds the specialist panel.
 *
 * TODO(kalendarz wizyt): `nextVisit` and `lastVisit` come from the appointment
 * calendar, which the team moved to low priority. They are unused by the safety
 * plan and are kept here only so this file stays the same shape as the profile
 * branch's.
 */
export const PROFILE_CARE: CareDetails = {
  // EXAMPLE DATA — a made-up specialist, matching the mockup's example patient.
  specialist: 'mgr Marta Zielińska',
  approach: 'CBT / DBT',
  // null, not a placeholder number.
  //
  // It was `000 000 000` — all-zeroes so that no demo device could ring a real
  // person who never agreed to be anybody's emergency contact. That protected the
  // bystander but not the patient: it rendered a live `tel:` link under "Kontakt
  // do terapeuty lub lekarza", and somebody tapping it in a bad moment gets a
  // failed call that reads as "my therapist's number does not work". null is the
  // honest value — there is no phone column behind this yet — and it is also what
  // exercises the "bez numeru w planie" branch, which was otherwise unreachable.
  phone: null,
  nextVisit: { date: '2026-09-15', time: '17:00' },
  lastVisit: { date: '2026-08-11', time: null },
}
