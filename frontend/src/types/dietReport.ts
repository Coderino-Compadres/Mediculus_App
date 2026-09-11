import type {
  DietActivityDay,
  DietJournalDay,
  DietMeal,
  DietSleepNight,
  HydrationDayTotal,
} from './diet'
import type { TimeOfDay } from '../utils/timeOfDay'

/**
 * The diet module's weekly report — **a proposal, not a contract yet.**
 *
 * WHY THIS IS NOT IN types/diet.ts. That file opens by saying that every type
 * in it is what an endpoint actually answers with, and it earns the claim:
 * `hydration`, `diet_meal`, `supplement` and `supplement_intake` are real
 * tables. Nothing here is. There is no `/api/diet/reports/`, the report is
 * derived in the browser from the module's existing shapes, and the shape below
 * is this frontend's suggestion of what the endpoint should eventually answer
 * with. Keeping it in its own file is what stops that distinction being lost —
 * whoever wires the backend is looking at a proposal to argue with, not at a
 * description of something that exists.
 *
 * WHAT IT IS BUILT FROM IS ONLY WHAT EXISTS. Meals (`DietMeal`: kind, hour,
 * description), the water figure per day (`HydrationDayTotal`), the activity
 * day and the sleep night. Nothing else is in the database.
 *
 * TODO(§05): the mockup's own report has three more sections — najczęstsze
 * emocje przy jedzeniu, głód fizyczny wobec emocjonalnego, sytuacje jedzenia
 * emocjonalnego. All three read the psychodietetic context of a meal, which is
 * §05 of the mockups: a 5-point mood, stress 0-10, two separate hunger scales,
 * emotions, the situation before the meal, fullness, satisfaction, the body's
 * reaction and free notes. **None of those columns exists** — not in
 * `DietMeal`, not in `diet_meal`, not in migration 0016 — and §04/§05's form
 * that would write them is not built. They join this shape together with that
 * form and its migration, and not before: a field invented here would be a
 * report claiming to summarise something nobody was ever asked.
 *
 * TODO(§10): "Zmiany od ostatniej wizyty" is deliberately absent as well. The
 * one pair of values the mockup says a report may compare is the two hungers
 * (§05, "to jedyna para wartości, którą raport zestawia ze sobą") and neither
 * exists; the app does not know when a visit happened; and comparing entry or
 * meal counts week to week would be a verdict on how regularly somebody wrote
 * things down, which is exactly the kind of score this module is built without.
 */

/**
 * Which part of the day a meal fell in.
 *
 * The four values are `TimeOfDay` from utils/timeOfDay.ts — the app's existing
 * vocabulary, reused so that "Rano" means the same word in both modules.
 * `'unspecified'` is the fifth column and it is not a time of day: it holds the
 * meals saved without an hour, which §05's "żadne pole nie blokuje zapisu"
 * makes an ordinary entry rather than an error, and which must not be dropped
 * from a grid just because they do not sort.
 */
export type DietMealSlot = TimeOfDay | 'unspecified'

/** One cell of the "Pory posiłków" grid: the meals that fell in one slot on one
 *  day. The meals themselves rather than a count, because the grid draws one
 *  dot per meal and names each dot by its kind — it never prints a number. */
export interface DietReportMealCell {
  slot: DietMealSlot
  meals: DietMeal[]
}

export interface DietReportMealRow {
  date: string
  /** One cell per slot in `DietReportMealGrid.slots`, in that order. */
  cells: DietReportMealCell[]
}

export interface DietReportMealGrid {
  /**
   * The columns actually drawn. Always the four times of day, in chronological
   * order; `'unspecified'` is appended only when some meal in the week has no
   * hour, because a permanently empty column reads as a question nobody
   * answered rather than as one nobody was asked.
   */
  slots: DietMealSlot[]
  /** One row per day, in the week's own order. */
  rows: DietReportMealRow[]
}

/**
 * One day inside a report — everything the four diaries hold about it.
 *
 * Every field is nullable and **nothing is summed**. A day with no water row is
 * `hydration: null`, not zero millilitres: "nobody wrote it down" and "this
 * person drank nothing" are different claims and the module is only ever
 * entitled to the first. The same rule the diary applies to an untouched
 * slider, and the same one `DietActivityDay.steps` documents for a step count.
 */
export interface DietReportDay {
  /** 'YYYY-MM-DD'. */
  date: string
  /** In the order they were eaten; the ones with no hour come last. */
  meals: DietMeal[]
  /** Water only, as the hydration screen's own week chart reports it. Null when
   *  the day holds no serving at all. */
  hydration: HydrationDayTotal | null
  /**
   * The night that *ended* on this morning — `DietSleepNight.date` is the
   * morning, so the night from Monday to Tuesday belongs to Tuesday and
   * therefore to whichever week Tuesday is in. Stated here because nothing in
   * the data says it: a row holding 23:40 and 06:50 reads equally well as
   * either day, and the two answers can put one night in two different weeks.
   */
  sleep: DietSleepNight | null
  activity: DietActivityDay | null
  /** True when none of the four holds anything. Rendered as "brak wpisu" — an
   *  ordinary day, never a gap to apologise for. */
  empty: boolean
}

export interface DietWeeklyReport {
  /** 'week-2026-09-01', keyed on the week's first day — see utils/dietWeeks.ts. */
  id: string
  weekStart: string
  weekEnd: string
  /** '26 sierpnia – 1 września 2026', ready to render. */
  rangeLabel: string
  /** Always seven, in the week's own order starting at `weekStart`. */
  days: DietReportDay[]
  /**
   * How many of the seven hold anything at all.
   *
   * A plain count and never a fraction: the mockup's "6 z 7 dni" is a
   * regularity score, and CLAUDE.md rules those out for this module along with
   * percentages and progress bars. The screens say "5 dni z wpisem".
   */
  daysWithEntry: number
  mealGrid: DietReportMealGrid
}

/**
 * What a report is built from — the four diaries, exactly as their own screens
 * already read them.
 *
 * ONE THING THIS CANNOT CARRY TODAY: the drinks that are not water. A serving
 * of tea is a `HydrationEntry` and those travel only for *today*
 * (`HydrationDay.entries`); the seven-day figures are `HydrationDayTotal`,
 * which is water and nothing else, by the client's rule that other drinks are
 * recorded and never converted. So a week can report water and cannot yet list
 * what else was drunk. That is a payload question for whoever writes
 * `/api/diet/reports/`, not something to approximate here.
 */
export interface DietReportSource {
  meals: DietJournalDay[]
  hydration: HydrationDayTotal[]
  activity: DietActivityDay[]
  sleep: DietSleepNight[]
}
