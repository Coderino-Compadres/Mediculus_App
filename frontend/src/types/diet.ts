import type { DrinkName } from '../utils/drinks'

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
 * The diet module's day, minus the hydration it used to carry.
 *
 * `hydration` was a field here while the whole module was an empty shape and one
 * `emptyDietDay()` produced all of it. It is a real endpoint now
 * (`HydrationDay`, above), read by the home screen and by /diet/hydration alike,
 * so keeping a second summary of it on this type would be a second answer about
 * one day — free to disagree with the first, which is the mistake the profile's
 * counters exist to avoid.
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
   * later is a change to one aggregation, not to this screen.
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
