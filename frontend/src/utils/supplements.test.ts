import { describe, expect, it } from 'vitest'
import {
  doseLabel,
  periodLabel,
  pluralItems,
  supplementDateLabel,
  takenCount,
} from './supplements'
import type { Supplement } from '../types/diet'

/**
 * How "Suplementy i leki" words a row.
 *
 * The wording lives here rather than on the wire, so this is where the two
 * composed lines from §08's artboard are pinned: "2000 IU · raz dziennie" and
 * "od 12 marca, bezterminowo". The rule that matters most is that a half nobody
 * answered produces *no line at all* rather than a "brak dawki" the app made up
 * — §05's "żadne pole nie blokuje zapisu" means a row by name alone is ordinary.
 */

const TODAY = new Date('2026-09-09T12:00:00')

function supplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: 's1',
    name: 'Witamina D3',
    dose: '2000 IU',
    frequency: 'raz dziennie',
    hours: ['08:00'],
    startDate: '2026-03-12',
    endDate: null,
    reminderEnabled: true,
    takenToday: false,
    ...overrides,
  }
}

describe('a date', () => {
  it('is the day and the month, as the artboard writes it', () => {
    expect(supplementDateLabel('2026-03-12', TODAY)).toBe('12 marca')
  })

  it('names the year only when it is not this one', () => {
    /** "od 3 marca" on a medicine taken since 2024 reads as three months. */
    expect(supplementDateLabel('2024-03-03', TODAY)).toBe('3 marca 2024')
  })

  it('is read as a local day, never as a UTC instant', () => {
    /** `new Date('2026-09-09')` is UTC midnight, which west of Warsaw is the
     *  day before — the same class of bug that moved the report cutoff to the
     *  backend. */
    expect(supplementDateLabel('2026-09-09', TODAY)).toBe('9 września')
  })

  it('is null rather than "Invalid Date" for something unparseable', () => {
    expect(supplementDateLabel('kiedyś', TODAY)).toBeNull()
  })
})

describe('the dose line', () => {
  it('joins the dose and the frequency the way the artboard does', () => {
    expect(doseLabel(supplement())).toBe('2000 IU · raz dziennie')
  })

  it('renders whichever half was answered', () => {
    expect(doseLabel(supplement({ frequency: null }))).toBe('2000 IU')
    expect(doseLabel(supplement({ dose: null }))).toBe('raz dziennie')
  })

  it('is null when neither was, rather than a name for the absence', () => {
    expect(doseLabel(supplement({ dose: null, frequency: null }))).toBeNull()
  })
})

describe('the period line', () => {
  it('says "bezterminowo" when there is no end date', () => {
    /** The artboard's own word, and a statement rather than a gap: null means
     *  "taken until further notice", not "nobody answered". */
    expect(periodLabel(supplement(), TODAY)).toBe('od 12 marca, bezterminowo')
  })

  it('spells out both ends when both are known', () => {
    expect(
      periodLabel(supplement({ startDate: '2026-06-02', endDate: '2026-09-02' }), TODAY),
    ).toBe('od 2 czerwca do 2 września')
  })

  it('says only the end when that is all there is', () => {
    /** A regimen that started before the app existed. */
    expect(
      periodLabel(supplement({ startDate: null, endDate: '2026-09-02' }), TODAY),
    ).toBe('do 2 września')
  })

  it('is null when neither date was given', () => {
    expect(
      periodLabel(supplement({ startDate: null, endDate: null }), TODAY),
    ).toBeNull()
  })
})

describe('counting', () => {
  it('says how many are ticked off today', () => {
    expect(takenCount([
      supplement({ id: 'a', takenToday: true }),
      supplement({ id: 'b', takenToday: false }),
      supplement({ id: 'c', takenToday: true }),
    ])).toBe(2)
  })

  it('is 0 for a list nobody has touched, and for an empty one', () => {
    expect(takenCount([])).toBe(0)
    expect(takenCount([supplement()])).toBe(0)
  })

  it('declines the list\'s own noun', () => {
    expect(pluralItems(1)).toBe('pozycja')
    expect(pluralItems(2)).toBe('pozycje')
    expect(pluralItems(4)).toBe('pozycje')
    expect(pluralItems(5)).toBe('pozycji')
    expect(pluralItems(12)).toBe('pozycji')
    expect(pluralItems(22)).toBe('pozycje')
    expect(pluralItems(0)).toBe('pozycji')
  })
})
