/**
 * "Profil zdrowotny" (§13) — the half of it that does not exist yet.
 *
 * **BOTH FUNCTIONS BELOW ARE STUBS THAT PERFORM NO REQUEST**, and that is
 * deliberate in exactly the way `deleteAccount` in api/account.ts is
 * deliberate: the client gets to see and use the complete screen, whoever
 * implements the backend gets a named contract to fill in, and the patient is
 * never told something was saved when nothing was.
 *
 * WHAT IS MISSING IS THE WHOLE STACK, not a mapping. There is no table, no
 * column, no model, no migration and no serializer for any field on this
 * screen — height, mass, target mass, activity level, allergies, intolerances,
 * eating preferences, conditions. `scripts/database_setup.sql` does not
 * mention them either. So this is not "the endpoint is not wired up"; it is
 * "there is nowhere to put this".
 *
 * TODO(backend): what a real implementation needs, in the order it needs it —
 *   1. a table in **user_db**, not medical_db. These are PII about a named
 *      person (a body, a diagnosis), and medical_db deliberately holds nothing
 *      but `id_medical`; putting a weight next to a pseudonymous key would put
 *      identity into the database whose whole point is not having any;
 *   2. `GET /api/account/health-profile/` and `PUT` on the same path, behind
 *      `_require_patient` like `/api/account/profile/` — a guardian and a
 *      specialist have no `patient` row and this is a patient's record;
 *   3. the conditions as their own rows rather than a text column, so the
 *      seventeen from §13 stay a closed vocabulary that
 *      `utils/healthProfile.ts` and the backend can be checked against each
 *      other (the same cross-language rule CLAUDE.md states for
 *      `emotions.ts` / `emotions.py`), with the hand-written ones beside them;
 *   4. an entry on `REMOVED_ITEMS` in components/AccountClosureConfirm.tsx —
 *      see the TODO there. A health profile that survives the deletion of the
 *      account it describes would make that screen a false promise.
 *
 * TODO(§08): whether the profile's "przyjmowane leki" is
 * `/diet/supplements`' data or a second entry is an open question on the
 * client's own artboard. Nothing here answers it — there is no medicine field
 * in `HealthProfileInput` and no link in either direction.
 */

import { PendingBackendError } from './account'
import type { HealthProfileDraft, HealthProfileInput } from '../types/healthProfile'
import { emptyHealthProfile } from '../utils/healthProfile'

/** The path both stubs stand in for, so a console line during a demo says what
 *  is missing rather than only that something is. */
const ENDPOINT = '/api/account/health-profile/'

/**
 * What the screen shows on arrival: an empty profile, every time.
 *
 * **NOT A PLACEHOLDER AWAITING EXAMPLE VALUES.** Resolving with
 * `emptyHealthProfile()` rather than rejecting is the honest answer to "what
 * does this account have on file", because the answer is genuinely "nothing":
 * with no store behind the screen, nothing was ever written. A rejection would
 * draw an error box over a screen that has not failed at anything.
 *
 * The temptation this comment exists to defuse: filling these in with the
 * artboard's 168 cm and 71 kg so the screen "shows something". That is what
 * `src/data/profile.ts` did with the mockup's example patient, and it was
 * deleted for it — a consent date invented for everybody proves nothing about
 * anybody (RODO art. 7(1)), and a body invented for everybody is worse. §13's
 * own note names the reason: among these patients are people with eating
 * disorders, and a weight is not a decorative number to them. Fill in the
 * *source*, never the values.
 */
export function fetchHealthProfile(): Promise<HealthProfileDraft> {
  return Promise.resolve(emptyHealthProfile())
}

/**
 * Saves the health profile. Today: rejects without sending anything.
 *
 * Rejecting with `PendingBackendError` rather than resolving is the whole
 * point — see the header of api/account.ts. A false success here is not
 * cosmetic: somebody could write down an allergy, be told it was saved, and
 * expect the dietitian to have read it.
 *
 * The parameter is typed even though nothing is sent, so the request body is
 * written down where the person building the endpoint will look for it.
 */
export function saveHealthProfile(input: HealthProfileInput): Promise<void> {
  // Referenced so the contract above is a real signature rather than a comment
  // the compiler ignores; `void` is how this file says "read, not sent".
  void input
  return Promise.reject(new PendingBackendError(`PUT ${ENDPOINT}`))
}
