/**
 * The parts of the profile screen that have no endpoint yet.
 *
 * Hardcoded on purpose, and hardcoded *here* rather than in the screen: when the
 * backend for these lands, "Profil" should change by swapping this import for an
 * `api/profile.ts` call, not by being rewritten. Nothing in this file is
 * identity — the signed-in user's name, e-mail and account type are real data
 * and are read from `useAuth()` (see pages/Profile.tsx), because a demo that
 * greeted the logged-in user with somebody else's name would read as a bug.
 *
 * The figures match the mockup's example patient so the two can be compared
 * side by side.
 */

import type { CareDetails, ConsentGrant, ProfileActivity } from '../types/profile'
import { CONSENT_IDS } from '../utils/consents'

/**
 * TODO(backend): both counters are already derivable from data the app has —
 * `entryCount` is the length of GET /api/diary/, and `streakDays` is the
 * `streak` GET /api/dashboard/home/ already answers with (core/dashboard.py).
 * They are hardcoded here only because this screen is frontend-only for now.
 *
 * TODO: the mockup shows a *third* counter — "7 technik" — and it is deliberately
 * absent. Counting techniques used would need a durable record of the
 * "pomogło / trochę / nie tym razem" rating, and that record was consciously not
 * built: the shape of the rating is still an open question with the client
 * (`raport.technique_efficiency` is the column waiting for it, and it is written
 * by nothing). A third tile would therefore have to display a number nobody can
 * compute — worse than an absent tile, because a wrong figure on a health app
 * looks like data rather than like a gap.
 */
export const PROFILE_ACTIVITY: ProfileActivity = {
  entryCount: 8,
  streakDays: 6,
}

/**
 * The one care record, read by two screens — the profile's "OPIEKA" card and the
 * safety plan's "Kontakt do terapeuty lub lekarza". See `CareDetails`: neither
 * screen keeps its own copy, so the two cannot name different therapists.
 *
 * TODO(backend): `specialist` and `approach` are `patient.specjalist` in user_db
 * and need only a serializer. `phone` has no column at all yet — the safety plan
 * is the first screen that wants to dial the specialist, and where that number
 * should live (on `specjalist`, or on the plan the specialist writes) is a schema
 * decision for whoever builds the specialist panel.
 *
 * The two appointment rows that used to be here were removed with the profile
 * card's own rows; the calendar module they needed is low priority anyway
 * ("zrobimy, jeśli starczy czasu").
 */
export const PROFILE_CARE: CareDetails = {
  // EXAMPLE DATA — a made-up specialist, matching the mockup's example patient.
  specialist: 'mgr Marta Zielińska',
  // Not on the profile card any more (the "Nurt" row was removed), still printed
  // under the therapist's name on the safety plan.
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
}

/**
 * When each consent was given.
 *
 * TODO(backend): unlike the rest of this file these two dates already exist in
 * the database — `user.data_consent_at` and `user.services_consent_at`, added by
 * migration 0004 and written at registration. They are hardcoded only because
 * `UserSerializer` does not expose them yet, so this is one serializer field
 * away from being real, not a missing feature.
 */
export const CONSENT_GRANTS: ConsentGrant[] = [
  { id: CONSENT_IDS.data, grantedAt: '2026-07-14' },
  { id: CONSENT_IDS.services, grantedAt: '2026-07-14' },
]
