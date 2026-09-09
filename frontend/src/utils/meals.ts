/**
 * How the diet module counts meals in words.
 *
 * One definition, because two screens say it: the home screen's "Dzisiaj
 * zapisane: 3 posiłki" and the history's row count. It was written out twice —
 * and the home screen's copy had it wrong past four ("5 posiłki"), which is the
 * ordinary fate of a Polish declension that lives in a component.
 *
 * There is deliberately nothing else in this file. A meal has no quantity to
 * format: §04 of the mockups states the module's scope outright — no product
 * search and no numeric field, a photo and a description being the only two
 * sources of a meal's content — so there is no portion, weight or calorie to
 * render, and this is the file somebody would add one to.
 */

/** "1 posiłek", "3 posiłki", "5 posiłków" — with the teens, which are all -ów. */
export function pluralMeals(count: number): string {
  const last = count % 10
  const teens = count % 100
  if (count === 1) return '1 posiłek'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${count} posiłki`
  return `${count} posiłków`
}
