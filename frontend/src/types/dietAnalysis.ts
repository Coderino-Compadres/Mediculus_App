import type { TimeOfDay } from '../utils/timeOfDay'

/**
 * The diet module's "Analiza" screen — its shape, and the shape of what it
 * refuses to say.
 *
 * NOT A REPORT, for the same reason `types/analysis.ts` is not: a weekly report
 * (types/dietReport.ts) covers seven fixed days counted from the patient's first
 * entry, is rebuilt per request and listed in a history. This is a continuous
 * view over a rolling stretch, recomputed every time the screen opens and stored
 * nowhere — so there is no id here, no range to archive under and no export.
 *
 * NOT A COPY OF THE PSYCHOTHERAPY ANALYSIS EITHER, and the differences are the
 * point rather than an oversight:
 *
 * - **there is no difficulty and no summary.** `AnalysisSummary` names a hardest
 *   weekday and a hardest part of the day off a 0-10 difficulty averaged from
 *   the mood tiles, the stress chip and two sliders. None of those four
 *   questions exists in this module, and inventing a "hard eating day" would be
 *   a verdict on somebody's food — which §15 of the client's mockups rules out
 *   by name ("bez oceniania jedzenia").
 * - **there is no insight paragraph.** §11 of the mockups: "wykres pokazuje,
 *   kiedy coś się działo, i nie dopisuje, co to znaczy". §10: "bez ocen, bez
 *   wniosków". `AnalysisInsight` has no counterpart below and must not gain one.
 * - **nothing is a fraction, a percentage or a score.** The same rule the weekly
 *   report is built under (`core/diet_reports.py`): every number here is a plain
 *   count of days.
 *
 * WHAT IT IS BUILT FROM IS ONLY WHAT CAN BE FETCHED. `fetchDietHistory()` is the
 * one diet endpoint with history longer than a day, so meals are the only source
 * below. See `utils/dietAnalysis.ts` for the TODO(backend) listing the three
 * server-side functions that already exist and the views that do not.
 */

/**
 * The stretch of days the analysis covers.
 *
 * Rolling and growing, exactly like `AnalysisWindow`: `days` is
 * min(DIET_ANALYSIS_WINDOW_DAYS, days since the first meal), so somebody eleven
 * days in gets an analysis of eleven days rather than an analysis of thirty that
 * is two thirds empty. Every caption on the screen has to state this number
 * rather than saying "30 dni".
 */
export interface DietAnalysisWindow {
  /** min(DIET_ANALYSIS_WINDOW_DAYS, days since the first meal), counted inclusively. */
  days: number
  /** ISO date of the window's first day. */
  startDate: string
  /** ISO date of its last day, i.e. today. */
  endDate: string
  /** How many of those days hold at least one meal. */
  daysWithMeal: number
  /** Meals in the window, with an hour and without. What the caption counts. */
  mealCount: number
}

/**
 * One square of "Regularność posiłków": a weekday crossed with a part of the day.
 *
 * THERE ARE THREE WAYS A SQUARE CAN CARRY NO COLOUR OR NO NUMBER, they are
 * different things, and the screen draws all three differently:
 *
 * - `observedDays === 0` — nothing is known about this weekday at all, because
 *   no day of it in the window holds a meal with an hour. `days` is null and the
 *   square is drawn as a dashed outline, reading "brak wpisu".
 * - `0 < observedDays < DIET_HEATMAP_MIN_WEEKDAY_DAYS` — this weekday is in the
 *   record, but on too few days to shade. `days` is a real count, and the square
 *   is drawn hatched rather than coloured, reading that there are too few days
 *   yet. Without this state a single observed Saturday would colour the whole
 *   Saturday column at full depth off one day of evidence.
 * - `days === 0` with the weekday observed often enough — this weekday *is* in
 *   the record, and no meal fell in this part of it. That is a measurement, so
 *   the square takes the ramp's palest colour.
 *
 * Collapsing any two would let "we have never heard from you on a Sunday", "we
 * have heard from you once" and "you did not eat then" render alike — three
 * claims about somebody's eating, two of them drawn from their not writing.
 */
export interface DietHeatmapCell {
  /** 0 = Monday, matching WEEKDAYS in utils/analysis.ts. */
  weekday: number
  slot: TimeOfDay
  /**
   * Days of this weekday in the window holding at least one meal with an hour.
   *
   * **THE SQUARE'S COLOUR IS COMPUTED AGAINST THIS AND NOTHING ELSE.** It is the
   * denominator that makes one column comparable with the next: thirty days do
   * not divide by seven, so two weekdays occur five times in the window and five
   * occur four, and a shade taken from a grid-wide maximum reads that
   * arithmetic back to the patient as a habit. It is also the second number the
   * square says out loud, because a count of days without the days it was
   * counted out of cannot be compared by the reader either.
   */
  observedDays: number
  /** How many of those hold a meal in this part of the day; null when there are none. */
  days: number | null
}

export interface DietHeatmap {
  /**
   * Days in the window holding at least one meal with an hour.
   *
   * Counted rather than the plain day count on purpose: a meal saved without an
   * hour cannot be placed on this grid at all, so thirty days of which three
   * carry an hour would otherwise unlock a map drawn from three points.
   */
  timedDays: number
  /** False until `timedDays` reaches DIET_HEATMAP_MIN_DAYS — the grid stays hidden. */
  unlocked: boolean
  /**
   * Always 7 × 4 squares, in weekday-then-part-of-day order.
   *
   * There is deliberately **no grid-wide maximum here** to scale the ramp
   * against, and nothing should add one back: a square is shaded against its own
   * weekday's `observedDays`, which is the only denominator that makes the seven
   * columns comparable. A shared ceiling is what made a patient who ate
   * identically every day read as though two weekdays were different.
   */
  cells: DietHeatmapCell[]
}

/** One bar of "Pory posiłków". The unit is days, never meals: two breakfasts on
 *  one Tuesday are one Tuesday morning. */
export interface DietSlotShare {
  slot: TimeOfDay
  /** Days in the window holding at least one meal in this part of the day. */
  days: number
}

export interface DietAnalysis {
  window: DietAnalysisWindow
  heatmap: DietHeatmap
  /** Always the four parts of the day, in chronological order — a part of the day
   *  the patient never ate in is a bar of zero, not a missing bar, because the
   *  window does hold days to have measured it against. */
  slots: DietSlotShare[]
  /**
   * Meals in the window saved without an hour.
   *
   * They are on neither the grid nor the bars — there is no part of the day to
   * put them in, and guessing one from anything else would be inventing an
   * answer nobody gave. Said out loud under the chart instead, because a patient
   * who saved eight meals without an hour is owed an explanation of why the bars
   * look thin. §05's "żadne pole nie blokuje zapisu" makes an hourless meal an
   * ordinary entry rather than a mistake, and the wording has to match that.
   */
  untimedMeals: number
}
