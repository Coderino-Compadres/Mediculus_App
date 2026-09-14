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
 * **NOTHING IS SUMMED AND NOTHING IS SCORED**, and that rule outlived the move:
 * no total meals for a week, no millilitres added up, no minutes of activity,
 * no averages, no comparison with the week before. `daysWithEntry` is the one
 * count in the whole feature and the screens render it as a plain number, never
 * as a fraction of seven — "6 z 7 dni" is a regularity score, and this module
 * does not score.
 */

import type { DietMealSlot } from '../types/dietReport'
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
