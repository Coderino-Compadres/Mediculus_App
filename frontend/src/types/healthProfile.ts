/**
 * "Profil zdrowotny" — §13 of the diet mockups.
 *
 * NOTHING BEHIND THIS SHAPE EXISTS YET. There is no table, no column, no
 * serializer and no endpoint: `grep` for any of these fields across
 * `backend/core/models.py`, the migrations and `scripts/database_setup.sql`
 * finds nothing. So this file is a **contract written from the artboard**, and
 * `src/api/healthProfile.ts` is the stub that will be filled in against it.
 *
 * WHY THE NUMBERS ARE `number | null` HERE AND STRINGS IN THE SCREEN. The form
 * holds what was typed — '71,' is a legitimate half-typed weight and must not
 * become 71 while the caret is still in the field — so the draft is text and
 * this is what the draft becomes on the way out (`toHealthProfileInput` in
 * utils/healthProfile.ts). null is "nothing was written", never 0: a patient
 * who has not filled in a weight has not weighed zero, and the difference is
 * the whole reason CLAUDE.md asks untouched controls to stay null.
 *
 * WHAT IS DELIBERATELY ABSENT FROM THIS SHAPE, and each absence is a decision
 * rather than a gap:
 *
 *   - **no BMI**, derived or stored. Not a field, not a getter, nowhere;
 *   - **no history.** One current number per field. A weight series is what a
 *     chart is made of, and §13's whole argument is that there is no chart;
 *   - **no difference between `weightKg` and `targetWeightKg`.** They are two
 *     independent fields that happen to sit next to each other, and nothing in
 *     this app may subtract one from the other;
 *   - **no medicines.** `/diet/supplements` holds them with a dose, a
 *     frequency, hours and dates. §08's own note leaves open whether the
 *     profile's "przyjmowane leki" is that data or a second entry, and
 *     answering it in a type would be answering it.
 */

/**
 * The three answers §13 offers for "poziom aktywności fizycznej".
 *
 * A closed set rather than free text, unlike the eating fields below, because
 * unlike an allergy this one genuinely has three answers on the artboard and
 * no space between them. `null` — nobody answered — is a fourth state and not
 * one of the three: the chips can be unpicked, and an untouched control that
 * quietly meant "niski" would be the app answering a question about somebody's
 * body on their behalf.
 */
export type ActivityLevel = 'low' | 'moderate' | 'high'

/** A condition from §13's list, identified by a stable key rather than by its
 *  Polish label — a label is a thing translators and clients reword. */
export type ConditionId =
  | 'diabetes-1'
  | 'diabetes-2'
  | 'insulin-resistance'
  | 'pcos'
  | 'hashimoto'
  | 'hypothyroidism'
  | 'hyperthyroidism'
  | 'coeliac'
  | 'bowel'
  | 'reflux'
  | 'hypertension'
  | 'hypercholesterolemia'
  | 'eating-disorder'
  | 'depression'
  | 'anxiety'
  | 'adhd'
  | 'autism'

/**
 * What the screen holds while it is being filled in.
 *
 * Text for every number, because this is the form's state and a form's state
 * is what somebody typed. See the note at the top of this file.
 */
export interface HealthProfileDraft {
  /** Centimetres, as typed. */
  heightCm: string
  /** Kilograms, as typed — a decimal comma is the Polish separator and this
   *  screen accepts it. */
  weightKg: string
  /** Kilograms, as typed. Independent of `weightKg` in every sense that
   *  matters: see the absences listed at the top of this file. */
  targetWeightKg: string
  activityLevel: ActivityLevel | null
  /**
   * The three eating fields, free text.
   *
   * §13's own note: "Pola opisowe, nie słownikowe — pacjentka wpisuje własnymi
   * słowami." The same artboard draws preferences as chips, which contradicts
   * it; the sentence wins, because a chip list is a closed list and somebody
   * allergic to something that is not on it has nowhere to write it down.
   */
  allergies: string
  intolerances: string
  dietaryPreferences: string
  /** Picked from §13's list. Order of this array is not meaningful. */
  conditions: ConditionId[]
  /** Conditions written in by hand — "z możliwością dodania własnej". */
  ownConditions: string[]
}

/**
 * What a save would send, once there is somewhere to send it.
 *
 * The numbers have become numbers and the text has been trimmed; an empty
 * answer is null (or an empty array), never '' and never 0.
 */
export interface HealthProfileInput {
  heightCm: number | null
  weightKg: number | null
  targetWeightKg: number | null
  activityLevel: ActivityLevel | null
  allergies: string | null
  intolerances: string | null
  dietaryPreferences: string | null
  conditions: ConditionId[]
  ownConditions: string[]
}
