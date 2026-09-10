/**
 * What the hydration screen can record, and the two numbers behind its buttons.
 *
 * The other half of `backend/core/drinks.py`, declared a second time here for
 * the same reason `utils/emotions.ts` is: the names travel on the wire as the
 * stored value, so a name spelled differently on one side is a chip the server
 * refuses. `test_drinks.py` parses this file and compares both lists character
 * for character — nothing else enforces the agreement.
 *
 * The Polish name *is* the value, the same arrangement as the emotions and the
 * opposite of `utils/timeOfDay.ts`, where the label lives here and the key lives
 * in the column. These names are short, stable and already the label; a key plus
 * a label map would be two things to keep in step for nothing.
 *
 * THE ONE RULE THAT MATTERS HERE is that only water counts. "Herbata, kawa i
 * napary są zapisywane, ale nie przeliczane na wodę — decyzja merytoryczna
 * zostaje po stronie specjalisty" (§08 of the mockups). So there is no
 * coefficient in this file and there must not be one: `Woda z cytryną` sitting
 * among the others is the client's call, not a rounding nobody got to.
 */

/** The one drink the daily goal counts. */
export const WATER = 'Woda'

/** Recorded, listed back, and deliberately never added to the water total.
 *  The order is the order §08 draws the chips in. */
export const OTHER_DRINKS = [
  'Herbata',
  'Kawa',
  'Napar ziołowy',
  'Woda z cytryną',
  'Kompot',
] as const

export type OtherDrink = (typeof OTHER_DRINKS)[number]
export type DrinkName = typeof WATER | OtherDrink

/** Everything `hydration.drink` may hold. */
export const DRINKS: readonly DrinkName[] = [WATER, ...OTHER_DRINKS]

/**
 * Glasses as the screen writes them: "1,6" rather than "1.6", and "4" rather
 * than "4,0".
 *
 * The backend sends the number already rounded to one decimal (a custom amount
 * of 400 ml is 1,6 glasses, and rounding that to 2 would report back more than
 * was entered). This only formats it — nothing here recomputes it from
 * millilitres, so the count under the bar and the count the server holds cannot
 * disagree.
 */
export function formatGlasses(glasses: number): string {
  return glasses.toLocaleString('pl-PL', { maximumFractionDigits: 1 })
}

/**
 * "szklanka / szklanki / szklanek", which Polish needs and English does not.
 *
 * Only whole numbers take the singular and the 2-4 form; a fractional count
 * ("1,6") takes the genitive plural, the same way Polish says "1,5 litra".
 */
export function pluralGlasses(glasses: number): string {
  if (!Number.isInteger(glasses)) return 'szklanek'
  const last = glasses % 10
  const teens = glasses % 100
  if (glasses === 1) return 'szklanka'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return 'szklanki'
  return 'szklanek'
}

/**
 * The seven weekday abbreviations the chart labels its columns with.
 *
 * Indexed by `Date.getDay()`, i.e. Sunday first. Written out rather than taken
 * from `toLocaleDateString('pl-PL', { weekday: 'short' })`, which returns
 * "pon.", "niedz.", "sob." — trimming those to two characters gives "Po", "Ni"
 * and "So", and §08 writes Pn, Nd and Sb.
 */
const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

/** "Pn", "Wt" … — the label under one column of the seven-day chart.
 *
 *  Parsed as local midnight (`T00:00:00`, no `Z`) so the label names the day the
 *  server named. `new Date('2026-09-09')` is parsed as UTC midnight, which west
 *  of Warsaw is the previous day — the same class of bug that moved the weekly
 *  report's cutoff to the backend. */
export function weekdayLabel(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()]
}
