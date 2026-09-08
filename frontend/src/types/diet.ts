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
