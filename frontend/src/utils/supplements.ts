/**
 * How "Suplementy i leki" words a row. Formatting only — nothing here decides
 * anything the server has not already answered.
 *
 * WHY THE WORDING IS HERE AND NOT ON THE WIRE. The API sends `dose`,
 * `frequency`, `hour`, `startDate` and `endDate` as they are stored, and the
 * artboard draws two composed lines from them ("2000 IU · raz dziennie", "od 12
 * marca, bezterminowo"). Composing those on the server would put Polish
 * declensions in a second place — the same reason `core/supplements.py` sends
 * dates rather than sentences, and the opposite of `core/drinks.py`, where the
 * Polish name *is* the value.
 *
 * `bezterminowo` IS THE ARTBOARD'S OWN WORD for a preparation with no end date,
 * and it is a statement rather than a gap: `endDate` null means "taken until
 * further notice", not "somebody forgot to answer". So the period line says it
 * out loud instead of trailing off after the start date.
 */

import type { Supplement } from '../types/diet'

/** "12 marca" — the day and the month, as the artboard writes a date.
 *
 *  The year is added only when the date is not in the current one. The mockup
 *  omits it, which is right for a regimen started this spring and misleading for
 *  one started in 2024 — "od 3 marca" on a medicine taken for two years reads as
 *  three months. Parsed as local midnight (`T00:00:00`, no `Z`), so the label
 *  names the day the server named: `new Date('2026-09-09')` is UTC midnight,
 *  which west of Warsaw is the day before. */
export function supplementDateLabel(iso: string, today: Date = new Date()): string | null {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * "2000 IU · raz dziennie", or whichever half was answered.
 *
 * Null when neither was: §05's rule is that no field blocks a save, so a
 * preparation recorded by name alone is an ordinary row and the screen renders
 * no dose line at all rather than an empty one or a "brak dawki" the patient
 * never wrote.
 */
export function doseLabel(supplement: Supplement): string | null {
  return [supplement.dose, supplement.frequency].filter(Boolean).join(' · ') || null
}

/**
 * "od 12 marca, bezterminowo" / "od 2 czerwca do 2 września" / "do 2 września".
 *
 * Null when neither date was given, for the same reason `doseLabel` is: there is
 * nothing to say, and a line saying so would be the app filling in an answer.
 */
export function periodLabel(
  supplement: Supplement,
  today: Date = new Date(),
): string | null {
  const from = supplement.startDate ? supplementDateLabel(supplement.startDate, today) : null
  const to = supplement.endDate ? supplementDateLabel(supplement.endDate, today) : null

  if (from && to) return `od ${from} do ${to}`
  if (from) return `od ${from}, bezterminowo`
  if (to) return `do ${to}`
  return null
}

/**
 * How many of today's preparations are ticked off, said as a fact and never as
 * a score.
 *
 * IT IS DELIBERATELY NOT ON THE SCREEN as "2 z 3". §08's rule about the water
 * goal — "nie ma gratulacji, serii ani komunikatu o niedoborze" — applies here
 * with more force, because among these patients are people with eating
 * disorders and this is a screen they open every morning. This function exists
 * for the **accessible summary** of the checkbox list (a screen reader reading
 * "lista, 3 pozycje, 2 odhaczone" is being told what is on screen, which is
 * what the ticks already say visually), and that is its only caller. Do not use
 * it to draw a figure, a bar or a percentage.
 */
export function takenCount(supplements: Supplement[]): number {
  return supplements.filter((supplement) => supplement.takenToday).length
}

/** "pozycja / pozycje / pozycji" — the list's own noun, declined. */
export function pluralItems(count: number): string {
  const last = count % 10
  const teens = count % 100
  if (count === 1) return 'pozycja'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return 'pozycje'
  return 'pozycji'
}
