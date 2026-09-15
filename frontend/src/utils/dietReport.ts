/**
 * How a weekly report is *worded*. It is no longer built here.
 *
 * **THE DERIVATION MOVED TO THE SERVER** (`core/diet_reports.py`), which is the
 * same move `utils/reports.ts` made for the psychotherapy module and for the
 * same two reasons: the "has this week ended" cutoff is now read on one clock
 * in `settings.TIME_ZONE` rather than on each reader's, and there is one
 * document rather than one per browser. What used to live here —
 * `buildDietReports`, `firstEntryDate`, the slot boundaries and the meal grid —
 * is there now, transcribed rather than rewritten, which is what these
 * functions were kept pure for.
 *
 * What is left is the one thing a payload cannot carry: a Polish label. The
 * slot *values* travel from the server (`morning`, `noon`, `evening`, `night`,
 * `unspecified`); their headings are this file's, the same split
 * `utils/timeOfDay.ts` makes and the opposite of `utils/emotions.ts`.
 *
 * **NOTHING ABOUT THE FOOD IS SUMMED AND NOTHING IS SCORED**, and that rule
 * outlived the move: no total meals for a week, no millilitres added up, no
 * minutes of activity, no average of what somebody ate, no comparison with the
 * week before. `daysWithEntry` is rendered as a plain number, never as a
 * fraction of seven — "6 z 7 dni" is a regularity score, and this module does
 * not score.
 *
 * The one section that counts and averages is §05's "najczęstsze emocje przy
 * jedzeniu", and the line it stays on is *what the number is about*: a feeling
 * the patient rated herself on the psychotherapy form's own 0-10 slider, never
 * the food. `emotionRatingNote` below is the wording that keeps that honest —
 * see `types/dietReport.ts` for the full argument.
 */

import type { DietMealSlot, DietReportEmotion } from '../types/dietReport'
import { mealsGenitive, mealsLocative } from './meals'
import { TIME_OF_DAY_LABELS } from './timeOfDay'

/** The column holding meals saved without an hour.
 *
 *  Declared here as well as on the server because the label below switches on
 *  it: it is not a time of day, so it has no entry in `TIME_OF_DAY_LABELS`. */
export const MEAL_SLOT_UNSPECIFIED = 'unspecified'

/**
 * What a column of the "Pory posiłków" grid is headed.
 *
 * The four times of day keep the app's own labels, so "Rano" means the same
 * word in both modules. A meal with no hour gets a column of its own rather
 * than being guessed into one or dropped — §05's "żadne pole nie blokuje
 * zapisu" makes it an ordinary entry, and the grid owes it a heading that says
 * so plainly.
 */
export function mealSlotLabel(slot: DietMealSlot): string {
  return slot === MEAL_SLOT_UNSPECIFIED ? 'Bez godziny' : TIME_OF_DAY_LABELS[slot]
}

/**
 * The caveat under one row of "Najczęstsze emocje przy jedzeniu", or null when
 * the row needs none.
 *
 * **A CHIP CAN BE PICKED WITHOUT BEING RATED**, which is what
 * `diet_meal_emotion.intensity` is nullable for: pressing "Lęk" and leaving the
 * slider alone says the feeling was there and says nothing about how strong it
 * was. So a row reading "7 posiłków · śr. 6,5 / 10" may be averaging five
 * numbers, not seven — and left unsaid, that is a precision nobody entered,
 * offered to a patient and possibly to the specialist reading it with her.
 *
 * Three rows, three sentences:
 *
 * - every picking was rated → null. Nothing to qualify, and a note on every row
 *   would train the eye to skip the ones that matter.
 * - some were → how many the average rests on, and how many were left open.
 * - none were → why there is no average at all. Without this the row looks like
 *   a bug ("why does this one have no number?") rather than like the ordinary
 *   answer it is: §05's rule is that no field blocks a save.
 *
 * Worded as "natężenie" rather than "ocena": the patient rated a feeling and
 * judged nothing, and a bare "bez oceny" next to a meal is exactly the reading
 * this module spends its whole design avoiding.
 *
 * The two cases are the reason `utils/meals.ts` holds three declensions of one
 * noun: "z … posiłków" is genitive, "przy … posiłkach" locative, and
 * `pluralMeals`' nominative fits neither.
 *
 * TAKES THE TWO COUNTS RATHER THAN A `DietReportEmotion`, so the "Analiza"
 * screen's `DietEmotionShare` can be handed to it as well: the caveat is about
 * a picked-but-unrated chip, which is a property of the chips and not of the
 * stretch of time they were counted over. One sentence for both screens, so a
 * patient does not meet two explanations of one thing.
 */
export function emotionRatingNote(
  row: Pick<DietReportEmotion, 'meals' | 'ratedMeals'>,
): string | null {
  if (row.ratedMeals === row.meals) return null

  if (row.ratedMeals === 0) {
    return 'Natężenie nie zostało ocenione — emocja została tylko zaznaczona.'
  }

  const unrated = row.meals - row.ratedMeals
  return (
    `Średnia z ${row.ratedMeals} ${mealsGenitive(row.ratedMeals)}; ` +
    `przy ${mealsLocative(unrated)} natężenie nie zostało ocenione.`
  )
}
