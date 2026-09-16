/**
 * "Profil zdrowotny" (§13) — the half of it that used to not exist.
 *
 * BOTH FUNCTIONS BELOW WERE STUBS THAT PERFORMED NO REQUEST, deliberately, in
 * exactly the way `deleteAccount` in api/account.ts still is: the client got to
 * see and use the complete screen, whoever implemented the backend got a named
 * contract to fill in, and the patient was never told something was saved when
 * nothing was. That contract is now filled in —
 * `GET/PUT /api/account/health-profile/` exists (`core/health_profile.py`,
 * `core/views.HealthProfileView`), the profile is stored, and this file talks
 * to it.
 *
 * ONE THING THE BACKEND DID DIFFERENTLY FROM WHAT THIS FILE ASKED FOR, and it
 * is worth knowing while reading either side. The TODO here asked for the table
 * in **user_db**, reasoning that a body and a diagnosis are PII about a named
 * person and that a weight beside a pseudonymous key "would put identity into
 * the database whose whole point is not having any". It landed in **medical_db**
 * instead, because that argument runs the wrong way: a weight identifies
 * nobody, while 'eating-disorder' and 'depression' stored next to the surname
 * and the e-mail address is the pairing the two-database split exists to
 * prevent. Everything else the TODO asked for is exactly as asked: the endpoint
 * is behind `_require_patient` (a guardian and a specialist are refused, not
 * handed an empty profile), and the conditions are rows in their own table with
 * a closed vocabulary that `core/tests/test_health_profile.py` compares against
 * `utils/healthProfile.ts` in both directions.
 *
 * WHAT CROSSES THE WIRE AND WHAT DOES NOT. The payload is snake_case and the
 * measurements are JSON numbers; the screen holds a `HealthProfileDraft`, whose
 * numbers are **text**, because a form's state is what somebody typed and '71,'
 * is a legitimate half-typed weight. The two mappings below are where that
 * conversion lives, and it is the only place in the app that formats a stored
 * weight back into a field.
 *
 * NOTHING HERE DERIVES ANYTHING FROM TWO NUMBERS. No BMI, no difference between
 * a weight and a target weight, no verdict — §13 forbids each by name and the
 * server sends none of them (`NothingIsAVerdictTests` guards the payload's
 * keys). A convenience field added here would be the client re-introducing what
 * both ends refuse.
 *
 * TODO(§08): whether the profile's "przyjmowane leki" is `/diet/supplements`'
 * data or a second entry is still an open question on the client's own
 * artboard. Nothing here answers it — there is no medicine field in
 * `HealthProfileInput` and no link in either direction.
 */

import { apiRequest } from './client'
import type { ActivityLevel, ConditionId, HealthProfileDraft,
  HealthProfileInput } from '../types/healthProfile'
import { formatMeasurement } from '../utils/healthProfile'

const ENDPOINT = '/api/account/health-profile/'

/**
 * The stored profile as the server sends it.
 *
 * Measurements are numbers (`core/health_profile.serialize_profile` casts the
 * NUMERIC columns rather than letting DRF quote them), and null everywhere
 * means "nothing was written" — never 0, which on this screen would be a
 * statement about somebody's body that they did not make.
 */
interface HealthProfilePayload {
  height_cm: number | null
  weight_kg: number | null
  target_weight_kg: number | null
  activity_level: ActivityLevel | null
  allergies: string | null
  intolerances: string | null
  dietary_preferences: string | null
  /** Optional for the reason `DietDayPayload.meals` is: a backend a release
   *  behind this file sends no such key, and an empty list is a better answer
   *  than a screen that throws. */
  conditions?: ConditionId[]
  own_conditions?: string[]
}

/**
 * The payload as the form holds it.
 *
 * The numbers become text here and nowhere else. `formatMeasurement` writes
 * them the way the field expects them — a Polish comma, and no trailing ',0'
 * on a whole number — so what comes back reads as what was typed rather than as
 * what a database column stores.
 *
 * The three text fields become '' rather than staying null, which is what
 * `HealthProfileDraft` declares: a textarea needs a string, and null would make
 * React treat it as uncontrolled and warn.
 */
function toDraft(payload: HealthProfilePayload): HealthProfileDraft {
  return {
    heightCm: formatMeasurement(payload.height_cm),
    weightKg: formatMeasurement(payload.weight_kg),
    targetWeightKg: formatMeasurement(payload.target_weight_kg),
    activityLevel: payload.activity_level,
    allergies: payload.allergies ?? '',
    intolerances: payload.intolerances ?? '',
    dietaryPreferences: payload.dietary_preferences ?? '',
    conditions: payload.conditions ?? [],
    ownConditions: payload.own_conditions ?? [],
  }
}

/**
 * What this account has on file.
 *
 * A profile nobody has filled in comes back empty rather than as a 404 — the
 * server's own choice, and the same one `/api/diet/sleep/` makes: the screen is
 * a form, there is always a profile on it, and an untouched profile and one
 * saved with every field blank are the same thing in truth.
 *
 * A rejection therefore means a *failure*, and the screen must render it as
 * one. That distinction is the reason this function no longer resolves with an
 * empty draft the way the stub did: blank fields after a dropped connection do
 * not read as "we could not fetch this", they read as "you have not filled
 * anything in", and the first thing somebody does about that is type their
 * allergies in again over the top of the ones the server still holds.
 */
export async function fetchHealthProfile(): Promise<HealthProfileDraft> {
  return toDraft(await apiRequest<HealthProfilePayload>(ENDPOINT))
}

/**
 * Saves the health profile, and answers with what was stored.
 *
 * PUT REPLACES RATHER THAN MERGES, which is the server's rule and this layer
 * sends the whole form to match it: an allergy left out of the body is one the
 * patient took back, not one left unchanged. Every field is optional on both
 * ends — §05's "Żadne pole nie blokuje zapisu" — so an empty profile is an
 * ordinary save rather than a refused one.
 *
 * It returns the *stored* profile rather than resolving with nothing, so the
 * screen can settle on what the server actually holds: trimmed text, a
 * condition order normalised to §13's, a measurement the column rounded. The
 * same shape `saveSleepNight` has, and for the same reason — a form that keeps
 * showing its own draft after a save can disagree with the record it just
 * wrote.
 */
export async function saveHealthProfile(
  input: HealthProfileInput,
): Promise<HealthProfileDraft> {
  return toDraft(
    await apiRequest<HealthProfilePayload>(ENDPOINT, {
      method: 'PUT',
      body: {
        height_cm: input.heightCm,
        weight_kg: input.weightKg,
        target_weight_kg: input.targetWeightKg,
        activity_level: input.activityLevel,
        allergies: input.allergies,
        intolerances: input.intolerances,
        dietary_preferences: input.dietaryPreferences,
        conditions: input.conditions,
        own_conditions: input.ownConditions,
      },
    }),
  )
}
