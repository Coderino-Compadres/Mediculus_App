import type { DrinkName } from '../utils/drinks'

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
  drink: DrinkName
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
   * How many meals today holds. A count rather than the meals themselves,
   * because this screen never renders a meal — it renders whether the day has
   * started. The list of meals belongs to "Historia dzienniczków żywieniowych".
   */
  mealCount: number
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
  /** 'HH:MM', or null for a preparation taken at no fixed hour. */
  hour: string | null
  /** 'YYYY-MM-DD'. */
  startDate: string | null
  /** 'YYYY-MM-DD', or null for "bezterminowo". */
  endDate: string | null
  reminderEnabled: boolean
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
  hour: string | null
  startDate: string | null
  endDate: string | null
  reminderEnabled: boolean
}
