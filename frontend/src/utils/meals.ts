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

/** "1 posiłek", "3 posiłki", "5 posiłków" — with the teens, which are all -ów. */
export function pluralMeals(count: number): string {
  const last = count % 10
  const teens = count % 100
  if (count === 1) return '1 posiłek'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${count} posiłki`
  return `${count} posiłków`
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
