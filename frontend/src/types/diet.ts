import type { FeelingAfter } from '../utils/activity'
import type { SleepQuality, WakeFeeling } from '../utils/sleep'

/**
 * The diet module's day, as its home screen reads it.
 *
 * WHY THIS TYPE EXISTS BEFORE THE BACKEND DOES. There is no `/api/diet/…` of any
 * kind yet — no table, no endpoint, nothing in `medical_db` that records a meal.
 * The home screen still has to be built from a shape rather than from four
 * hardcoded strings, or the day the API arrives the screen gets rewritten
 * instead of rewired. So this is the contract: `api/diet.ts` is the only place
 * that produces a value of this type today, and it is the only place that has to
 * change when the endpoint exists.
 *
 * Everything here is a *summary of the day*, never the content of a meal. The
 * mockups' own scope note is explicit that a meal is a photo plus a description
 * and nothing else — no product search, no numeric field — so nothing in this
 * module counts calories, and nothing in this type could.
 */

/** Glasses drunk today against the daily target the module suggests. */
export interface DietHydration {
  glasses: number
  /** From `DIET_HYDRATION_TARGET`; travels so the screen never hardcodes "6". */
  target: number
}

export interface DietDay {
  /** 'YYYY-MM-DD' in the reader's own calendar day — see utils/days.ts. */
  date: string
  /**
   * Consecutive days with at least one meal written.
   *
   * NOT the psychotherapy streak (`dashboard.streakDays`, counted over `diary`).
   * Whether the two modules share one streak or keep their own is an open
   * question for the client — the mockup shows a streak on both home screens and
   * says nothing about which. Keeping it a separate field means answering it
   * later is a change to one aggregation, not to this screen.
   */
  streakDays: number
  /**
   * How many meals today holds. A count rather than the meals themselves,
   * because this screen never renders a meal — it renders whether the day has
   * started. The list of meals belongs to "Historia dzienniczków żywieniowych".
   */
  mealCount: number
  hydration: DietHydration
}

/**
 * One meal, as the history lists it.
 *
 * A meal's *content* is a photo and a description and nothing else — the
 * mockups' §04 states that scope outright, which is why there is no weight, no
 * portion and no product here to render. The photo is not in this type yet: no
 * part of this deployment stores a file, and that is the module's largest open
 * question (storage, retention, the consent it falls under). It joins this shape
 * when it has somewhere to live.
 */
export interface DietMeal {
  id: string
  /**
   * 'Śniadanie', 'Przekąska' — how the mockups label a meal ("Przekąska ·
   * 16:20"). Nullable because §05's rule is that no field blocks a save, so a
   * meal can be written without saying which one it was.
   */
  kind: string | null
  /** 'HH:MM' in the patient's own clock, as the mockups write it. Nullable for
   *  the same reason as `kind`. */
  time: string | null
  /** What the patient typed. '' when they saved a meal without describing it,
   *  which the mockups explicitly allow ("niepełny wpis też jest wpisem"). */
  description: string
}

/**
 * One day of the food diary.
 *
 * A *dzienniczek* is a day, and a day holds meals — the module's own vocabulary,
 * from the home screen's "DZISIEJSZY DZIENNICZEK" down to §07's title in the
 * plural ("Historia dzienniczków żywieniowych"). Which is also why the history
 * is a list of days rather than a flat list of meals: a patient looks back on
 * "wtorek", not on "the 41st meal".
 */
export interface DietJournalDay {
  /** 'YYYY-MM-DD' — the calendar day, in the reader's own zone. */
  date: string
  /** Newest first within the day, as the API will send them. */
  meals: DietMeal[]
}

/**
 * One activity somebody wrote down.
 *
 * WHAT IS NOT IN THIS TYPE, and will not be: calories burnt, intensity, pace,
 * heart rate, a target and a streak. The module records what a patient chose to
 * note, not what a device measured — synchronising with a watch or a step
 * counter is outside the project's scope, so there is nothing here that could
 * only be filled in by one. What is left is the mockups' own three questions:
 * what it was, how long it lasted, and how the person felt afterwards.
 *
 * Every field but the identity ones is nullable, because §05's rule holds
 * across the whole module: no field blocks a save. An activity saved with
 * nothing but an hour is an ordinary entry.
 */
export interface DietActivityEntry {
  id: string
  /**
   * 'YYYY-MM-DD' — the calendar day the activity belongs to, in the reader's
   * own zone (`utils/days.ts`). Editable only while it is today; see
   * `utils/dayLock.ts`.
   */
  date: string
  /** 'HH:MM', when the entry was written. Shown at the head of a row. */
  time: string
  /**
   * One of `ACTIVITY_KINDS`, or `ACTIVITY_KIND_OTHER` with the free text in
   * `kindOther`. The two collapse into one answer — read them through
   * `activityKindLabel`, never separately, the same way the diary's place chip
   * and its "Inne" box collapse into one column.
   */
  kind: string | null
  /** What was typed under "Inne". '' whenever `kind` is not that chip. */
  kindOther: string
  /** Minutes. Null when the question went unanswered. */
  durationMinutes: number | null
  /** How the person felt *after* — not how hard it was. See utils/activity.ts. */
  feelingAfter: FeelingAfter | null
}

/**
 * One day of the activity diary: what was done, and the step count for the day.
 *
 * Steps sit here rather than on an entry because they are a property of the day
 * — one number somebody copies off their phone once, not something attached to
 * the walk they described. Null until they do, and null is not zero: "nobody
 * typed a step count" and "this person took no steps" are different claims, and
 * the module is only ever entitled to the first.
 */
export interface DietActivityDay {
  /** 'YYYY-MM-DD' in the reader's own calendar day. */
  date: string
  /** Newest first, as the API will send them. */
  entries: DietActivityEntry[]
  /** Typed by hand, whenever the patient feels like it. No target, no history. */
  steps: number | null
}

/**
 * One night of the sleep diary.
 *
 * WHICH NIGHT: the one that *ended* on the morning of `date`. An entry filled in
 * on Friday morning describes the night from Thursday to Friday and carries
 * Friday's date. Nothing in the data itself says so — a row holding 23:40 and
 * 06:50 reads equally well as either day, and the two answers put it in
 * different weeks — so the rule is stated here, at the field, and argued in
 * `utils/sleep.ts`.
 *
 * The length of the night is deliberately absent: it is derived from the two
 * hours by `sleepDurationMinutes`, and storing it as well would be a second
 * copy free to disagree with them. It is the only value this module computes.
 */
export interface DietSleepNight {
  /** 'YYYY-MM-DD' — the morning the night ended on. */
  date: string
  /** 'HH:MM' in the patient's own clock. Null when unanswered. */
  fellAsleepAt: string | null
  /** 'HH:MM'. Null when unanswered. Earlier than `fellAsleepAt` is the ordinary
   *  case, not an error — the night crosses midnight. */
  wokeUpAt: string | null
  /** 1-5, or null when the question went unanswered. */
  quality: SleepQuality | null
  /** How many times the night was interrupted. Zero is a real answer here — it
   *  is what the control starts at and what "an unbroken night" means — so
   *  unlike the fields above it is not nullable. */
  awakenings: number
  wakeFeeling: WakeFeeling | null
}
