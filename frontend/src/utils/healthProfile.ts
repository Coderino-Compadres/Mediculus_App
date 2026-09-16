/**
 * The health profile's vocabulary and its pure functions — everything §13 needs
 * that is not a React component, so the wording and the parsing can be tested
 * without mounting a screen (the same reason utils/consents.ts and
 * utils/roles.ts exist).
 *
 * NOTHING HERE COMPARES TWO NUMBERS. There is no difference between a weight
 * and a target weight, no ratio, no BMI and no verdict on a value — not
 * because they would be hard, but because §13 rules them out by name and says
 * why: "Wśród pacjentek są osoby z zaburzeniami odżywiania — te dwie liczby są
 * danymi dla specjalisty, nie celem pokazywanym codziennie." A helper that
 * computed one would be the first half of the feature it forbids, sitting in
 * the file the screen already imports.
 */

import type {
  ActivityLevel,
  ConditionId,
  HealthProfileDraft,
  HealthProfileInput,
} from '../types/healthProfile'

export interface ActivityLevelOption {
  value: ActivityLevel
  label: string
}

/**
 * §13's three, in the artboard's order.
 *
 * Lower case, because they are answers in a sentence ("poziom aktywności
 * fizycznej: umiarkowany") rather than titles — which is how the B set writes
 * them into its own field.
 */
export const ACTIVITY_LEVELS: ActivityLevelOption[] = [
  { value: 'low', label: 'niski' },
  { value: 'moderate', label: 'umiarkowany' },
  { value: 'high', label: 'wysoki' },
]

export interface ConditionOption {
  id: ConditionId
  label: string
}

/**
 * §13's seventeen, in the B set's order.
 *
 * TWO DECISIONS ARE BAKED INTO THIS ARRAY.
 *
 * **The psychiatric diagnoses are in the same list as the somatic ones** —
 * eating disorders, depression, anxiety, ADHD and autism sit between
 * hypercholesterolemia and the end, with no heading between them. That is the
 * A set's own note ("Rozpoznania psychiatryczne stoją w tej samej liście, co
 * somatyczne — bez osobnej sekcji") and it is a good one: a separate section
 * would make a dietitian's intake form draw a line around the patient's
 * psychiatric history and show them it is on the other side of it.
 *
 * **Declaration order is render order and never changes.** The A set floats
 * the picked chips to the top; the B set leaves them in place. The B set is
 * followed, because a chip that jumps somewhere else the moment it is tapped
 * takes the next tap with it — which on a seventeen-item grid means unpicking
 * one thing and picking another by accident.
 */
export const CONDITIONS: ConditionOption[] = [
  { id: 'diabetes-1', label: 'Cukrzyca typu 1' },
  { id: 'diabetes-2', label: 'Cukrzyca typu 2' },
  { id: 'insulin-resistance', label: 'Insulinooporność' },
  { id: 'pcos', label: 'PCOS' },
  { id: 'hashimoto', label: 'Hashimoto' },
  { id: 'hypothyroidism', label: 'Niedoczynność tarczycy' },
  { id: 'hyperthyroidism', label: 'Nadczynność tarczycy' },
  { id: 'coeliac', label: 'Celiakia' },
  { id: 'bowel', label: 'Choroby jelit' },
  { id: 'reflux', label: 'Refluks' },
  { id: 'hypertension', label: 'Nadciśnienie' },
  { id: 'hypercholesterolemia', label: 'Hipercholesterolemia' },
  { id: 'eating-disorder', label: 'Zaburzenia odżywiania' },
  { id: 'depression', label: 'Depresja' },
  { id: 'anxiety', label: 'Zaburzenia lękowe' },
  { id: 'adhd', label: 'ADHD' },
  { id: 'autism', label: 'Spektrum autyzmu' },
]

/**
 * An empty profile — what the screen opens with, every time.
 *
 * **IT IS EMPTY ON PURPOSE AND MUST STAY EMPTY.** There is no endpoint to read
 * from (see src/api/healthProfile.ts), and the alternative to blank fields is
 * example values — which is what `src/data/profile.ts` used to be, hardcoded
 * to the mockup's patient, and why it was deleted. A height and a weight are
 * not decoration: printed into somebody's own profile they are a statement
 * about that person's body, shown to that person, in an app whose §13 says in
 * so many words that some of its users have eating disorders. Whoever wires
 * the backend replaces the *source* of these values; nobody fills them in here
 * to make the screen look finished.
 */
export function emptyHealthProfile(): HealthProfileDraft {
  return {
    heightCm: '',
    weightKg: '',
    targetWeightKg: '',
    activityLevel: null,
    allergies: '',
    intolerances: '',
    dietaryPreferences: '',
    conditions: [],
    ownConditions: [],
  }
}

/**
 * What a measurement field accepts as it is typed.
 *
 * Digits and one separator, nothing else — so a stray letter never reaches the
 * field rather than being rejected after the fact with a message. The comma is
 * kept as a comma: Polish writes 71,5 and retyping somebody's separator under
 * their caret is the kind of "help" that makes a field feel broken.
 *
 * Deliberately NOT `<input type="number">`, which is the same choice
 * `DietActivityPanel` made for the step count: on a numeric input the browser
 * hands back '' for anything it considers invalid, so a half-typed '71,'
 * arrives as an empty string and the field clears itself mid-word.
 */
export function typeMeasurement(typed: string, maxDigits: number): string {
  // One separator at most, and everything after a second one is dropped.
  const [whole, ...rest] = typed.replace(/[^\d.,]/g, '').split(/[.,]/)
  const head = whole.slice(0, maxDigits)
  if (rest.length === 0) return head
  // The separator the user actually typed, so a keyboard with a decimal point
  // does not fight one with a comma.
  const separator = typed.includes(',') ? ',' : '.'
  return `${head}${separator}${rest.join('').slice(0, 1)}`
}

/**
 * A typed measurement as a number, or null when nothing usable was written.
 *
 * null rather than 0 or NaN for '', ',' and '71,' alike: "not filled in" is a
 * real answer on every field of this screen and it has exactly one encoding.
 */
export function parseMeasurement(typed: string): number | null {
  // '71,' is a half-typed number rather than a broken one, so the dangling
  // separator is dropped instead of making the whole field unreadable.
  const normalised = typed.replace(',', '.').replace(/\.$/, '')
  if (normalised === '') return null
  const value = Number(normalised)
  // `> 0` rather than `>= 0`: nobody is 0 cm tall or weighs 0 kg, so a zero is
  // a typo rather than an answer — and reading it as an answer would put a
  // figure on somebody's profile that they did not mean.
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * A stored measurement as the field should show it.
 *
 * The inverse of `parseMeasurement`, and the only place in the app that turns a
 * number back into one of these fields. Three things it has to get right:
 *
 *   - **a comma, not a point.** Polish writes 71,5, and the field somebody then
 *     edits accepts both — but showing them a point they did not type is the
 *     app rewriting their own answer back at them;
 *   - **no trailing ',0'.** The column is NUMERIC(4,1), so 168 comes back as
 *     168.0; printing "168,0 cm" would add a precision nobody claimed, and the
 *     next save would read it back as the same number anyway;
 *   - **'' for null**, because the draft is text and "nothing was written" is
 *     an empty field. Never '0' — a patient who has not filled in a weight has
 *     not weighed zero, which is the same distinction `parseMeasurement` keeps
 *     going the other way.
 */
export function formatMeasurement(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return ''
  // One decimal place is all the column holds, so rounding here cannot lose an
  // answer -- and it keeps a float's tail (71.30000000000001) out of a field.
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',')
}

/** Trimmed, or null when there is nothing but whitespace. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The draft as the request body it will one day be.
 *
 * Its own function so the stub's contract is written down and testable now,
 * rather than being invented inside a submit handler on the day the endpoint
 * lands.
 */
export function toHealthProfileInput(draft: HealthProfileDraft): HealthProfileInput {
  return {
    heightCm: parseMeasurement(draft.heightCm),
    weightKg: parseMeasurement(draft.weightKg),
    targetWeightKg: parseMeasurement(draft.targetWeightKg),
    activityLevel: draft.activityLevel,
    allergies: orNull(draft.allergies),
    intolerances: orNull(draft.intolerances),
    dietaryPreferences: orNull(draft.dietaryPreferences),
    // Copied rather than passed by reference. Every other field here is
    // already a new value (parsed, trimmed, or mapped), and this one was the
    // exception: handing the component's own state array to a caller means an
    // API layer that sorts or normalises the payload before sending would
    // reorder React state in place, with nothing to re-render it.
    conditions: [...draft.conditions],
    ownConditions: draft.ownConditions
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
  }
}

/**
 * Whether a measurement field holds something that cannot be a measurement.
 *
 * Only ever a *gentle* verdict, and only for a value that is genuinely
 * meaningless — a lone separator, or a zero. An empty field is never wrong:
 * §05's rule for the whole module is that no field blocks a save, and this
 * screen keeps it.
 *
 * The wording is a request rather than a failure. "Sprawdź" and not "Błędna
 * wartość": somebody typing their own weight into a health app is not being
 * graded.
 */
export function measurementProblem(typed: string, unit: 'cm' | 'kg'): string | null {
  if (typed.trim() === '') return null
  if (parseMeasurement(typed) !== null) return null
  return unit === 'cm'
    ? 'Sprawdź, proszę, ten wzrost — potrzebujemy liczby centymetrów.'
    : 'Sprawdź, proszę, tę wagę — potrzebujemy liczby kilogramów.'
}
