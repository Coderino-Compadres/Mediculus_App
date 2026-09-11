import type { FeelingAfter } from '../utils/activity'
import type { SleepQuality, WakeFeeling } from '../utils/sleep'

/**
 * The diet module's shapes, as its four screens read them.
 *
 * THESE ARE ALL REAL NOW. This file used to open by saying there was no
 * `/api/diet/…` of any kind and that `api/diet.ts` invented every value in it;
 * `hydration` was the first table, and `diet_meal`, `supplement` and
 * `supplement_intake` closed the rest. Every type below is what an endpoint
 * actually answers with, mapped in `api/diet.ts` and nowhere else.
 *
 * ONE THING IS STILL MISSING and it is a decision rather than work: the form
 * that *writes* a meal (§04/§05 of the mockups). The photo in it would be the
 * first file this deployment ever stored, and where it lives, how long it is
 * kept and which consent covers it are all unanswered — so `DietMeal` has no
 * photo field and `/api/diet/meals/` accepts no write verb. Rows come from
 * `manage.py seed_demo_diary` and `scripts/mock_data.sql` until it does.
 *
 * NOTHING HERE COUNTS FOOD, and nothing in it could. The mockups' own scope note
 * is explicit that a meal is a photo plus a description and nothing else — no
 * product search, no numeric field — and §02/§05 rule out a score for a day.
 * There is no calorie, macro, weight or target field in this file, and adding
 * one is the change that would need arguing for, not the change that "completes"
 * it.
 */

/**
 * One thing the patient recorded drinking today.
 *
 * `amountMl` is null for every drink but water: the mockups' "Inne napoje" card
 * offers a chip and no quantity, and inventing 250 ml for a cup of tea would put
 * a number nobody entered into a clinical record.
 */
export interface HydrationEntry {
  id: string
  /**
   * One of `DRINKS`, or a name the patient typed.
   *
   * A plain `string` rather than `DrinkName`, and that is the type saying what
   * the column now holds: the six chips are the quick way in, not the whole
   * vocabulary. The server folds a typed name onto a chip's spelling when it
   * matches one (`normalize_drink`), so this is never "herbata" next to
   * "Herbata" — but it may be anything else the patient drinks.
   */
  drink: string
  amountMl: number | null
  /** ISO moment it was recorded — the list orders by it, newest first. */
  at: string | null
}

/** One column of the "Ostatnie 7 dni" chart. Water only, by the client's rule. */
export interface HydrationDayTotal {
  /** 'YYYY-MM-DD'. */
  date: string
  waterMl: number
  glasses: number
}

/**
 * Everything the hydration screen draws, as `GET /api/diet/hydration/` answers.
 *
 * WHY THE SCALE AND THE GOAL TRAVEL rather than being constants here: they are
 * one definition on the server (`core/drinks.py`) and a per-patient goal set by
 * a psychodietitian is the obvious next step, at which point a screen holding
 * its own "6" would quietly be showing the wrong one. Nothing in the frontend
 * hardcodes either number.
 *
 * `glasses` is computed on the server too, to one decimal, so the figure under
 * the bar and the figure the database holds cannot disagree — the same reason
 * the profile's counters are not computed twice.
 *
 * `progress` is capped at 1 and `glasses` is not: past the goal the bar is
 * simply full and the day still says what it was. There is deliberately no
 * "goal met" flag anywhere in this shape — §08 is explicit that there are no
 * congratulations, no streak and no message about falling short.
 */
export interface HydrationDay {
  /** 'YYYY-MM-DD' in the reader's own calendar day. */
  date: string
  glassMl: number
  bottleMl: number
  targetGlasses: number
  /** Bounds the "Własna ilość" input enforces before submitting. */
  minAmountMl: number
  maxAmountMl: number
  /** How long a typed drink name may be — read off the payload rather than
   *  spelled into the input, like the two bounds above. */
  maxDrinkName: number
  waterMl: number
  glasses: number
  /** 0..1, for the bar's width. */
  progress: number
  /** Today's servings, newest first — water and other drinks alike. */
  entries: HydrationEntry[]
  /** Seven days, oldest first, today last. */
  week: HydrationDayTotal[]
}

/**
 * The diet module's day, as `GET /api/diet/today/` answers it.
 *
 * `hydration` was a field here while the whole module was an empty shape and one
 * `emptyDietDay()` produced all of it. It is a real endpoint now
 * (`HydrationDay`, above), read by the home screen and by /diet/hydration alike,
 * so keeping a second summary of it on this type would be a second answer about
 * one day — free to disagree with the first, which is the mistake the profile's
 * counters exist to avoid.
 *
 * There is deliberately no target, no comparison with yesterday and no flag on
 * this shape: §02's rule is that "pusty dzień nie jest brakiem: jest
 * zaproszeniem bez presji".
 */
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
   * later is a change to one aggregation (`core/meals.streak_days`), not to this
   * screen.
   */
  streakDays: number
  /**
   * How many meals today holds.
   *
   * Kept alongside `meals` rather than derived from its length: it is what the
   * greeting line renders, it travels from the server, and two places counting
   * one day is how they end up disagreeing.
   */
  mealCount: number
  /**
   * Today's meals, in the order the history renders a day — newest first,
   * the unhoured ones last.
   *
   * The home screen used to get a count alone, on the argument that it renders
   * whether the day has started and the meals live a screen away in the
   * history. That stopped being true when today's meals became **editable**:
   * correcting a mistyped meal is something somebody does about today, on the
   * screen they are already on, and a home screen that knew only "three" could
   * offer no way to reach the one that is wrong.
   *
   * Only today. Every other day is still the history's.
   */
  meals: DietMeal[]
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
 * What §04's "Dodawanie posiłku" form submits.
 *
 * THE THREE THINGS A MEAL HOLDS, and deliberately no fourth. There is no
 * portion, no weight and no calorie count — §04 states that scope outright —
 * and no photo, which is the module's one open question rather than an
 * oversight: `diet_meal` has no column for one, and where a file would live,
 * how long it is kept and which consent covers it are all unanswered.
 *
 * NONE OF IT IS REQUIRED. §05's rule is that no field blocks a save, taken
 * literally on both sides: an input with every field null is a valid meal, and
 * the backend writes it. What it records is that a meal happened, which is
 * itself the thing this diary is for.
 *
 * There is no date on this shape and there must not be: the server stamps the
 * day from its own clock, so a form that only ever shows today cannot write
 * into the archive.
 */
export interface DietMealInput {
  /** One of `MEAL_KINDS` (utils/meals.ts), or null for a meal saved without
   *  saying which one it was. A value outside that list is a 400, never a
   *  silently dropped answer. */
  kind: string | null
  /** 'HH:MM', or null. Null is "not answered", not midnight. */
  time: string | null
  /** '' and null both mean "left empty"; the mapping sends one of them. */
  description: string
}

/** What the write answers with: the row, and the day it moved.
 *
 *  Both, because the two screens reading this table draw different things — the
 *  history draws the meal, the home screen draws a count and a streak that both
 *  move when one meal is written. Recomputing either in the browser is how one
 *  day ends up with two versions of itself. */
export interface DietMealSaved {
  meal: DietMeal
  day: DietDay
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

/**
 * One preparation on "Suplementy i leki" (§08), as
 * `GET /api/diet/supplements/` answers it.
 *
 * ONLY `name` IS ANSWERED FOR CERTAIN. Everything else is nullable because
 * somebody who knows they take magnesium and not the dose has to be able to
 * write it down — §05's "żadne pole nie blokuje zapisu", applied to this form.
 *
 * `endDate` null means **bezterminowo**, the artboard's own wording for the
 * vitamin D row, rather than an unanswered question. `utils/supplements.ts` is
 * what turns the two dates into the period line ("od 12 marca, bezterminowo");
 * the wording lives there and not on the wire, because a Polish declension in
 * two places is two places free to drift.
 *
 * `takenToday` is the checkbox, and it is the *only* thing this shape says about
 * whether a dose was taken. There is no count, no streak and no adherence
 * figure — nor a "not taken" for any day, because unticking deletes the row and
 * nothing in this app stores that somebody missed a medicine. That absence is
 * the design: a "took 3 of 5" on the screen a patient opens every morning is
 * exactly the kind of score this module is built without.
 *
 * `reminderEnabled` travels although **nothing sends a reminder** — this
 * deployment has no push and no mail. It is the patient's answer to a question
 * the form asks, kept so the day a scheduler exists it reads a column rather
 * than asking everybody again, and the screen says out loud that nothing is
 * sent yet.
 */
export interface Supplement {
  id: string
  name: string
  dose: string | null
  /** 'raz dziennie', 'wg zaleceń lekarza' — free text, not a vocabulary. */
  frequency: string | null
  /**
   * The hours it is taken at, 'HH:MM' each, in the order of a day.
   *
   * A LIST, because a preparation can be taken more than once a day — a
   * probiotic at 06:45 and again at 12:00 is one position on this list with
   * two hours on its row, not two positions sharing a name. Empty means no
   * fixed hour, which is what the single nullable `hour` used to mean.
   *
   * Sorted and de-duplicated by the server, so nothing here has to.
   */
  hours: string[]
  /** 'YYYY-MM-DD'. */
  startDate: string | null
  /** 'YYYY-MM-DD', or null for "bezterminowo". */
  endDate: string | null
  reminderEnabled: boolean
  /**
   * Whether it was ticked off **today** — one tick for the whole day, even on
   * a preparation taken several times.
   *
   * That is deliberate rather than an oversight: a tick is a fact about a day
   * (`uq_supplement_intake_day`), and making each dose tickable separately
   * would mean the intake table learning about hours *and* a decision about
   * what an untaken dose means — which is the one thing §08 says this module
   * must not record.
   */
  takenToday: boolean
}

/** What the "+ Dodaj suplement lub lek" form submits, and what an edit submits.
 *
 *  Same shape minus the two things the server owns: the id, and whether it was
 *  ticked off today (which is its own endpoint, because it is an act rather than
 *  a property of the row). */
export interface SupplementInput {
  name: string
  dose: string | null
  frequency: string | null
  /** Zero or more 'HH:MM'. PUT replaces them, so an hour left out is an hour
   *  taken off — the same rule the rest of this form follows. */
  hours: string[]
  startDate: string | null
  endDate: string | null
  reminderEnabled: boolean
}
