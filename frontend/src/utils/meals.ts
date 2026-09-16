/**
 * How the diet module counts meals in words.
 *
 * One definition, because two screens say it: the home screen's "Dzisiaj
 * zapisane: 3 posiłki" and the history's row count. It was written out twice —
 * and the home screen's copy had it wrong past four ("5 posiłki"), which is the
 * ordinary fate of a Polish declension that lives in a component.
 *
 * `MEAL_KINDS` joined it when §04's form was built, and it is the second half
 * of `backend/core/meals.py`'s list rather than a translation of it: the Polish
 * name *is* the stored value, the same arrangement as `utils/drinks.ts` and
 * `utils/emotions.ts`. A name spelled differently on one side is a picker the
 * server refuses with a 400 — `test_meals.py` parses this file and compares
 * both lists, and their order, character for character.
 *
 * THERE IS STILL NO QUANTITY IN THIS FILE, and that is the line worth keeping.
 * §04 states the module's scope outright — no product search and no numeric
 * field, a photo and a description being the only two sources of a meal's
 * content — so there is no portion, weight or calorie to format, and this is
 * the file somebody would add one to.
 */

/**
 * What §04's picker offers, in the order it draws them — which is also the
 * order of a day, so it is content rather than presentation.
 *
 * Picking none is an ordinary answer: §05's rule is that no field blocks a
 * save, so the form lets a chip be pressed a second time to take it back.
 */
export const MEAL_KINDS = [
  'Śniadanie',
  'Drugie śniadanie',
  'Obiad',
  'Podwieczorek',
  'Kolacja',
  'Przekąska',
] as const

export type MealKind = (typeof MEAL_KINDS)[number]

/** "1 posiłek", "3 posiłki", "5 posiłków" — with the teens, which are all -ów.
 *
 *  The nominative, which is the case a count takes on its own ("Dzisiaj
 *  zapisane: 3 posiłki"). The two functions below are the same noun after a
 *  preposition that governs a different case, and Polish gives no way to share
 *  one form between them. */
export function pluralMeals(count: number): string {
  return `${count} ${mealsNoun(count)}`
}

/**
 * The same nominative noun **without** its count — 'posiłek' / 'posiłki' /
 * 'posiłków'.
 *
 * For the figure tiles on the guardian's card, which draw the number and its
 * label as two separate elements (a large value over a small caption), so a
 * string holding both cannot be used there. `pluralMeals` above is this plus the
 * number, rather than the other way round, so the three forms are written once.
 */
export function mealsNoun(count: number): string {
  const last = count % 10
  const teens = count % 100
  if (count === 1) return 'posiłek'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return 'posiłki'
  return 'posiłków'
}

/**
 * The genitive noun alone, for "wyliczone **z** N posiłków".
 *
 * Genitive rather than `pluralMeals`' nominative, because the preposition
 * governs it: "z 3 posiłków", not "z 3 posiłki". That collapses every count
 * above one onto one form and leaves only the singular different — the same
 * split, for the same reason, as `entriesGenitive` and `daysGenitive` in
 * utils/analysis.ts.
 *
 * It lived in `utils/dietAnalysis.ts` until the weekly report needed the same
 * case for the same noun. Declensions of "posiłek" belong next to each other
 * and next to `MEAL_KINDS`, not in whichever screen's helper file happened to
 * need one first — that is how a module ends up with two spellings of one word.
 */
export function mealsGenitive(count: number): string {
  return count === 1 ? 'posiłku' : 'posiłków'
}

/**
 * "przy 1 posiłku", "przy 2 posiłkach", "przy 7 posiłkach" — the locative, with
 * its number.
 *
 * "przy" governs the locative, so neither of the two above fits: "przy 2
 * posiłki" and "przy 2 posiłków" are both wrong. The plural has one form for
 * every count, which is why this is the shortest of the three.
 *
 * The number travels with the noun here, unlike `mealsGenitive`, because every
 * caller needs both and a bare "posiłkach" reads as a fragment at the call
 * site.
 */
export function mealsLocative(count: number): string {
  return count === 1 ? '1 posiłku' : `${count} posiłkach`
}

/**
 * "Przekąska · 16:20", or whichever half the patient answered.
 *
 * The mockups' own formatting, from §05's header. Null when a meal answered
 * neither question — which is an ordinary meal (§05: no field blocks a save),
 * so the caller leads with the description instead. Nothing here reads
 * "Nieznany posiłek": the app does not label an answer somebody chose not to
 * give.
 *
 * Shared by the history and the home screen's list of today. It was the
 * history's own local function until today's meals became editable and the
 * home screen had to render them too — and a second copy is the shape in
 * which one screen starts writing "16:20 · Przekąska".
 */
export function mealHeading(meal: {
  kind: string | null
  time: string | null
}): string | null {
  return [meal.kind, meal.time].filter(Boolean).join(' · ') || null
}
